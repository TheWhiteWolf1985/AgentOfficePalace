"""Project contract checks, not a full glTF validator or a quality/animation certification."""
from pathlib import Path
import argparse,hashlib,json,math,re,struct,sys
from glb_common import parse,local,mul,transform,I
KIT=Path(__file__).resolve().parents[1]

def inspect(data,contract,profile,manifest=None):
    g,binary=parse(data);errors=[];p=contract['profiles'][profile];nodes=g.get('nodes',[]);required=p['nodes'];tol=contract['tolerance_m']
    def check(ok,message):
        if not ok:errors.append(message)
    check(len(data)<=p['limits']['bytes'],'GLB exceeds file budget')
    check(not g.get('animations') and not g.get('skins'),'Rigid profile forbids clips and skins')
    check(not g.get('cameras') and 'KHR_lights_punctual' not in g.get('extensionsUsed',[]),'No cameras or lights')
    check(not g.get('extensionsRequired'),'No required extensions/compression')
    check(len(g.get('buffers',[]))==1 and not g['buffers'][0].get('uri') and g['buffers'][0]['byteLength']<=len(binary),'One embedded BIN buffer required')
    names=[n.get('name','') for n in nodes];check(len(set(names))==len(names),'Duplicate node names')
    check(all(re.fullmatch('[A-Za-z][A-Za-z0-9_]*',x) for x in names),'Invalid node names')
    check(len(nodes)<=128,'Too many nodes');lookup={n:i for i,n in enumerate(names)};parents={};world={};active=set()
    for i,n in enumerate(nodes):
        check('skin' not in n and 'camera' not in n,'Skin/camera node forbidden')
        for j in n.get('children',[]):
            if not isinstance(j,int) or j<0 or j>=len(nodes):raise ValueError('Invalid child index')
            check(j not in parents,'Multiple parents');parents[j]=i
    def matrix(i,trail=frozenset()):
        if i in trail:raise ValueError('Hierarchy cycle')
        if i not in world:world[i]=mul(matrix(parents[i],trail|{i}),local(nodes[i])) if i in parents else local(nodes[i])
        return world[i]
    def ancestor(i,name):
        while True:
            if names[i]==name:return True
            if i not in parents:return False
            i=parents[i]
    for i,n in enumerate(nodes):
        matrix(i);m=local(n);det=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
        check(det>1e-10,'Negative/zero scale: '+names[i])
    root='fp_root' if profile=='first_person' else 'char_root'
    check(len(g.get('scenes',[]))==1 and g.get('scene',0)==0,'Exactly one scene required')
    check(g.get('scenes',[{}])[0].get('nodes',[])==[lookup.get(root)],'Scene must contain only the character root')
    for name,definition in required.items():
        if name not in lookup:errors.append('Missing control: '+name);continue
        i=lookup[name];n=nodes[i];check('mesh' not in n,'Control must be an Empty/group: '+name)
        check('matrix' not in n,'Use local TRS on control: '+name)
        check((names[parents[i]] if i in parents else None)==definition['parent'],'Wrong parent: '+name)
        for key,default,t in [('translation',[0,0,0],tol),('scale',[1,1,1],contract['scale_tolerance'])]:
            check(len(n.get(key,default))==3 and all(abs(a-b)<=t for a,b in zip(n.get(key,default),definition[key])),'Wrong '+key+': '+name)
        a=n.get('rotation',[0,0,0,1]);b=definition['rotation'];check(len(a)==4 and min(sum((x-y)**2 for x,y in zip(a,b)),sum((x+y)**2 for x,y in zip(a,b)))<=contract['rotation_tolerance']**2,'Wrong rotation: '+name)
    for i in range(len(nodes)):check(ancestor(i,root),'Node outside root: '+names[i])
    def values(index):
        a=g['accessors'][index];check(not a.get('sparse'),'Sparse accessor outside profile');view=g['bufferViews'][a['bufferView']]
        if view.get('buffer',0)!=0:raise ValueError('External buffer')
        ct=a['componentType'];fmt,size={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[ct]
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=view.get('byteStride',size*components);start=view.get('byteOffset',0)+a.get('byteOffset',0)
        if stride<size*components or start<0 or (a['count'] and start+(a['count']-1)*stride+size*components>view.get('byteOffset',0)+view['byteLength']) or view.get('byteOffset',0)+view['byteLength']>len(binary):raise ValueError('Accessor exceeds bufferView/BIN')
        return [struct.unpack_from('<'+fmt*components,binary,start+i*stride) for i in range(a['count'])]
    lo=[math.inf]*3;hi=[-math.inf]*3;tris=mesh_instances=primitives=0;mesh_names=[]
    for i,n in enumerate(nodes):
        if 'mesh' not in n:continue
        mesh_names.append(names[i]);mesh_instances+=1
        if profile=='human':check(any(ancestor(i,k) for k in ['char_torso','char_head','char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx']),'Human mesh must belong to a hideable/moving body part: '+names[i])
        for primitive in g['meshes'][n['mesh']]['primitives']:
            primitives+=1;check(primitive.get('mode',4)==4,'TRIANGLES only');check(not primitive.get('targets'),'No morph targets')
            attrs=primitive['attributes'];check(not any(k.startswith(('JOINTS','WEIGHTS')) for k in attrs),'No skin attributes')
            pos=values(attrs['POSITION']);a=g['accessors'][attrs['POSITION']];check(a['componentType']==5126 and a['type']=='VEC3','Float VEC3 positions required')
            check('NORMAL' in attrs,'Normals required')
            if 'NORMAL' in attrs:check(len(values(attrs['NORMAL']))==len(pos),'Normals count mismatch')
            for v in pos:
                if not all(math.isfinite(x) for x in v):raise ValueError('Nonfinite vertex')
                v=transform(matrix(i),v)
                for k in range(3):lo[k]=min(lo[k],v[k]);hi[k]=max(hi[k],v[k])
            if 'indices' in primitive:
                ix=values(primitive['indices']);check(all(0<=v[0]<len(pos) for v in ix),'Index out of range');count=len(ix)
            else:count=len(pos)
            check(count%3==0,'Triangle count not integral');tris+=count//3
    check(mesh_instances>0,'No character geometry')
    for k in range(3):check(lo[k]>=p['bounds_min'][k]-tol and hi[k]<=p['bounds_max'][k]+tol,'Rest bounds exceed profile on axis '+str(k))
    for key,value in [('triangles',tris),('mesh_instances',mesh_instances),('primitives',primitives),('materials',len(g.get('materials',[])))]:check(value<=p['limits'][key],'Budget exceeded: '+key)
    materials=g.get('materials',[]);material_names=[m.get('name','') for m in materials];prefix='fp_mat_' if profile=='first_person' else 'char_mat_'
    check(len(set(material_names))==len(material_names) and all(re.fullmatch(prefix+'[A-Za-z0-9_]+',n) for n in material_names),'Material names/duplicates invalid')
    roles=(manifest or {}).get('material_roles') or {r:prefix+r for r in p['required_material_roles']}
    if profile=='human' and any(ancestor(i,'char_hair') for i,n in enumerate(nodes) if 'mesh' in n):
        roles=dict(roles);roles.setdefault('hair','char_mat_hair');check(roles.get('hair') in material_names,'Hair geometry requires hair material role')
    for role in p['required_material_roles']:check(roles.get(role) in material_names,'Missing material role: '+role)
    for role,name in roles.items():
        if name is None:continue
        check(name in material_names,'Material role does not exist: '+role)
        if name in material_names and role in ['skin','clothing','hair','body','status']:check('baseColorTexture' not in materials[material_names.index(name)].get('pbrMetallicRoughness',{}),'Dynamic role cannot have a base color texture: '+role)
    for m in materials:check(m.get('alphaMode','OPAQUE')!='BLEND','No alpha BLEND material')
    for image in g.get('images',[]):
        check(not image.get('uri'),'Images must be embedded in BIN')
        if 'bufferView' not in image:continue
        view=g['bufferViews'][image['bufferView']];b=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];mime=image.get('mimeType')
        if mime=='image/png' and b[:8]==b'\x89PNG\r\n\x1a\n':w,h=struct.unpack_from('>II',b,16)
        elif mime=='image/jpeg' and b[:2]==b'\xff\xd8':
            j=2;w=h=0
            while j+4<len(b):
                if b[j]!=255:break
                marker=b[j+1];length=int.from_bytes(b[j+2:j+4],'big')
                if marker in [192,193,194] and length>=8:h,w=struct.unpack_from('>HH',b,j+5);break
                if length<2:break
                j+=2+length
        else:errors.append('Image MIME/header unsupported');continue
        check(0<w<=2048 and 0<h<=2048,'Texture exceeds 2048px or invalid dimensions')
    if manifest is not None:
        check(manifest.get('contract')==contract['contract'] and manifest.get('contract_version')==contract['version'],'Wrong manifest contract')
        check(manifest.get('units')=='meters' and manifest.get('root')==root,'Wrong manifest units/root');check(manifest.get('forward')==('-Z' if profile=='first_person' else '+Z'),'Wrong manifest forward');check(manifest.get('profile')==profile,'Wrong manifest profile');check(manifest.get('sha256')==hashlib.sha256(data).hexdigest(),'Manifest SHA mismatch')
        for key in ['asset_id','file','blender_version','license']:check(isinstance(manifest.get(key),str) and bool(manifest[key].strip()),'Unfilled manifest: '+key)
        check(set(manifest.get('body_mesh_nodes',[]))==set(mesh_names),'Manifest mesh nodes mismatch')
        check(manifest.get('nodes')==required,'Manifest control definitions mismatch')
        check(not manifest.get('deviations'),'Manifest deviations require separate review; not an in-contract PASS')
    return {'status':'FAIL' if errors else 'PASS','profile':profile,'errors':errors,'metrics':{'triangles':tris,'mesh_instances':mesh_instances,'primitives':primitives,'materials':len(materials),'bytes':len(data),'bounds_min':lo,'bounds_max':hi},'mesh_nodes':mesh_names,'scope':'static contract; no manual/Blender/runtime certification'}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('glb',type=Path);ap.add_argument('--profile',choices=['human','agent','first_person'],required=True);ap.add_argument('--manifest',type=Path);ap.add_argument('--report',type=Path);ap.add_argument('--contract',type=Path,default=KIT/'rules/constraints.json');a=ap.parse_args()
    try:r=inspect(a.glb.read_bytes(),json.loads(a.contract.read_text(encoding='utf8')),a.profile,json.loads(a.manifest.read_text(encoding='utf8')) if a.manifest else None)
    except Exception as e:r={'status':'FAIL','errors':[str(e)]}
    if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(r,indent=2)+'\n',encoding='utf8')
    print(json.dumps(r,ensure_ascii=False));sys.exit(0 if r['status']=='PASS' else 1)
