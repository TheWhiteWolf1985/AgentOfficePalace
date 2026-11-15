"""Inspect a GLB and this kit's profile using only Python's standard library.
This is not the complete Khronos validator or a replacement for Blender/manual review.
"""
from pathlib import Path
import argparse,hashlib,json,math,re,struct,sys

I=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
def mul(a,b):return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
def transform(m,p):return [sum(m[r][k]*([*p,1][k]) for k in range(4)) for r in range(3)]
def local(n):
    if 'matrix' in n:
        v=n['matrix']
        if len(v)!=16:raise ValueError('node matrix length')
        return [[v[c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);tx,ty,tz=n.get('translation',[0,0,0])
    if not all(math.isfinite(v) for v in [x,y,z,w,sx,sy,sz,tx,ty,tz]):raise ValueError('nonfinite transform')
    if abs(x*x+y*y+z*z+w*w-1)>0.001:raise ValueError('non-unit quaternion')
    return [[(1-2*(y*y+z*z))*sx,2*(x*y-z*w)*sy,2*(x*z+y*w)*sz,tx],
            [2*(x*y+z*w)*sx,(1-2*(x*x+z*z))*sy,2*(y*z-x*w)*sz,ty],
            [2*(x*z-y*w)*sx,2*(y*z+x*w)*sy,(1-2*(x*x+y*y))*sz,tz],[0,0,0,1]]

def parse(data):
    if len(data)<20:raise ValueError('GLB truncated')
    magic,version,length=struct.unpack_from('<III',data)
    if magic!=0x46546c67 or version!=2 or length!=len(data):raise ValueError('GLB header/version/length invalid')
    chunks=[];offset=12
    while offset<len(data):
        if offset+8>len(data):raise ValueError('chunk header truncated')
        length,kind=struct.unpack_from('<II',data,offset);offset+=8
        if length%4 or offset+length>len(data):raise ValueError('chunk length/alignment invalid')
        chunks.append((kind,data[offset:offset+length]));offset+=length
    if not chunks or chunks[0][0]!=0x4e4f534a:raise ValueError('first chunk must be JSON')
    if sum(t==0x4e4f534a for t,_ in chunks)!=1 or sum(t==0x004e4942 for t,_ in chunks)>1:raise ValueError('duplicate chunks')
    g=json.loads(chunks[0][1]);binary=next((v for t,v in chunks if t==0x004e4942),b'')
    if g.get('asset',{}).get('version')!='2.0':raise ValueError('asset.version must be2.0')
    return g,binary

def inspect(data,contract,manifest=None,reference=False):
    g,binary=parse(data);errors=[];warnings=[];tol=contract['tolerance_m']
    if g.get('extensionsRequired'):errors.append('Required glTF extensions are outside this profile')
    for entry in g.get('buffers',[])+g.get('images',[]):
        uri=entry.get('uri')
        if uri and not uri.startswith('data:'):errors.append('External resource: '+uri)
    if len(g.get('buffers',[]))>1:errors.append('Expected one embedded GLB buffer')
    if g.get('buffers') and g['buffers'][0].get('byteLength',0)>len(binary):errors.append('BIN shorter than declared buffer')
    if g.get('animations') or g.get('skins') or g.get('cameras'):errors.append('No character rigs, animations or cameras in this asset profile')
    nodes=g.get('nodes',[]);names=[n.get('name','') for n in nodes]
    if len(set(names))!=len(names) or any(not n for n in names):errors.append('Every node must have a unique nonempty name')
    parent={}
    for i,n in enumerate(nodes):
        for c in n.get('children',[]):
            if not isinstance(c,int) or c<0 or c>=len(nodes):raise ValueError('Invalid child index')
            if c in parent:raise ValueError('Node has more than one parent')
            parent[c]=i
    matrices={}
    def world(i,seen=None):
        if i in matrices:return matrices[i]
        seen=set() if seen is None else set(seen)
        if i in seen:raise ValueError('Cyclic node hierarchy')
        seen.add(i);base=local(nodes[i]);matrices[i]=mul(world(parent[i],seen),base) if i in parent else base
        return matrices[i]
    for i in range(len(nodes)):world(i)
    root_name='aop_reference_only' if reference else contract['root_node']
    if root_name not in names:errors.append('Root missing: '+root_name);root_idx=None
    else:
        root_idx=names.index(root_name)
        if root_idx in parent:errors.append('Asset root has a parent')
        if any(abs(matrices[root_idx][r][c]-I[r][c])>1e-5 for r in range(4) for c in range(4)):errors.append('Root transform is not identity')
        roots=g.get('scenes',[{}])[g.get('scene',0)].get('nodes',[])
        if roots!=[root_idx]:errors.append('Active scene must contain only the asset root')
    def under(i,name):
        while True:
            if nodes[i].get('name')==name:return True
            if i not in parent:return False
            i=parent[i]
    if root_idx is not None and any(not under(i,root_name) for i in range(len(nodes))):errors.append('Nodes outside asset hierarchy')
    if reference:
        if root_idx is not None and nodes[root_idx].get('extras',{}).get('aop_reference_only') is not True:errors.append('Reference-only marker missing')
    else:
        for n in contract['required_exported_nodes']:
            if n not in names:errors.append('Required node missing: '+n)
        for n in names:
            if any(n.lower().startswith(p) for p in contract['forbidden_export_prefixes']):errors.append('Guide/collider in production GLB: '+n)
    sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
    types={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    def accessor(idx):
        a=g['accessors'][idx]
        if 'sparse' in a:raise ValueError('Sparse accessors not inspected by this lightweight profile')
        v=g['bufferViews'][a['bufferView']]
        if v.get('buffer',0)!=0:raise ValueError('Non-embedded accessor')
        code,size=types[a['componentType']];dim=sizes[a['type']];count=a['count'];stride=v.get('byteStride',dim*size)
        if stride<dim*size:raise ValueError('Accessor stride too short')
        start=v.get('byteOffset',0)+a.get('byteOffset',0);end=start+max(0,count-1)*stride+(dim*size if count else 0)
        if start<0 or end>len(binary) or end>v.get('byteOffset',0)+v['byteLength']:raise ValueError('Accessor outside buffer view')
        vals=[list(struct.unpack_from('<'+code*dim,binary,start+i*stride)) for i in range(count)]
        if any(not math.isfinite(float(x)) for row in vals for x in row):raise ValueError('Accessor contains nonfinite numbers')
        return vals
    bounds={};vertex_count=0
    for i,n in enumerate(nodes):
        if 'mesh' not in n:continue
        pts=[]
        for prim in g['meshes'][n['mesh']]['primitives']:
            if not reference and prim.get('mode',4)!=4:errors.append('Production mesh primitive must be TRIANGLES: '+names[i])
            pos=accessor(prim['attributes']['POSITION'])
            if any(len(p)!=3 for p in pos):raise ValueError('POSITION is not VEC3')
            pts.extend(transform(matrices[i],p) for p in pos);vertex_count+=len(pos)
            if 'indices' in prim:
                inds=accessor(prim['indices'])
                if any(len(v)!=1 or v[0]<0 or v[0]>=len(pos) for v in inds):errors.append('Index outside positions')
        if pts:
            # glTF Y-up -> Blender Z-up
            pb=[(p[0],-p[2],p[1]) for p in pts];lo=[min(p[k] for p in pb) for k in range(3)];hi=[max(p[k] for p in pb) for k in range(3)]
            bounds[names[i]]={'min':lo,'max':hi}
            b=contract['design_xy_m'] if not reference and under(i,'furniture') else contract['outer_xy_m']
            if lo[0]<b['min_x']-tol or hi[0]>b['max_x']+tol or lo[1]<b['min_y']-tol or hi[1]>b['max_y']+tol or lo[2]<contract['minimum_mesh_z_m']-tol:errors.append('Geometry outside envelope: '+names[i])
    if not reference:
        if not manifest:errors.append('Final delivery requires a completed manifest')
        else:
            if manifest.get('source_contract')!=contract['contract_version'] or manifest.get('root_node')!=contract['root_node']:errors.append('Manifest contract/root mismatch')
            h=manifest.get('ceiling_height_m')
            if not isinstance(h,(int,float)) or not math.isfinite(h) or h<=contract['avatar']['collision_height_m']:errors.append('Manifest ceiling height missing/invalid')
            if not manifest.get('blender_version'):errors.append('Blender version not recorded')
            arch=manifest.get('architecture',{})
            for role in ['floor_nodes','wall_nodes','ceiling_nodes']:
                if not arch.get(role) or any(n not in bounds for n in arch[role]):errors.append('Manifest architecture incomplete: '+role)
            for n in arch.get('floor_nodes',[]):
                if n in bounds and abs(bounds[n]['max'][2])>tol:errors.append('Finished floor not atZ0: '+n)
            seats=manifest.get('seats',[]);actual={n for n in names if re.fullmatch(contract['seat_regex'],n)}
            if not seats or {s.get('anchor') for s in seats}!=actual:errors.append('Manifest seating missing or not matching exported anchors')
            for s in seats:
                an,st=s.get('anchor'),s.get('stand')
                if an not in names or st not in names:errors.append('Seat/stand node missing');continue
                if st!='stand_'+an.split('_',1)[1]:errors.append('Seat/stand suffix mismatch')
                for key,name in [('position_blender_m',an),('stand_blender_m',st)]:
                    pos=transform(matrices[names.index(name)],[0,0,0]);pb=[pos[0],-pos[2],pos[1]];recorded=s.get(key)
                    if not isinstance(recorded,list) or len(recorded)!=3 or any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in recorded) or max(abs(a-b) for a,b in zip(pb,recorded))>tol:errors.append('Manifest coordinate mismatch: '+name)
                standpos=transform(matrices[names.index(st)],[0,0,0])
                if abs(standpos[1])>tol:errors.append('Stand anchor is not at finished floor')
            if not manifest.get('colliders'):errors.append('No collision boxes declared')
            for box in manifest.get('colliders',[]):
                lo,hi=box.get('min_blender_m'),box.get('max_blender_m')
                if not isinstance(lo,list) or not isinstance(hi,list) or len(lo)!=3 or len(hi)!=3 or any(not isinstance(v,(float,int)) or not math.isfinite(v) for v in [*lo,*hi]) or any(a>=b for a,b in zip(lo,hi)):errors.append('Invalid collider box: '+str(box.get('id')))
            if manifest.get('glb_sha256') and manifest['glb_sha256']!=hashlib.sha256(data).hexdigest():errors.append('GLB hash differs from manifest')
        if 'whiteboard_surface' in names:
            n=nodes[names.index('whiteboard_surface')]
            if 'mesh' not in n:errors.append('Whiteboard node is not a mesh')
            else:
                prims=g['meshes'][n['mesh']]['primitives']
                if len(prims)!=1:errors.append('Whiteboard must have one primitive/material')
                for prim in prims:
                    mat=g.get('materials',[])[prim.get('material',-1)] if 'material' in prim else {}
                    if mat.get('name')!=contract['whiteboard_material']:errors.append('Whiteboard dynamic material missing')
                    if 'TEXCOORD_0' not in prim['attributes']:errors.append('Whiteboard UV missing')
                    else:
                        uv={tuple(round(v,5) for v in row) for row in accessor(prim['attributes']['TEXCOORD_0'])}
                        if uv!={(0,0),(1,0),(1,1),(0,1)}:errors.append('Whiteboard UV not covering0..1 corners')
    warnings.append('Geometry/metadata checks only. Does not certify manual review, complete glTF conformance, Blender reimport or application integration.')
    return {'automatic_pass':not errors,'file_kind':'reference_only' if reference else 'production_asset','scope':'Partial structural, coordinate and delivery-profile checks','errors':errors,'warnings':warnings,'stats':{'nodes':len(nodes),'meshes':len(g.get('meshes',[])),'vertices_read':vertex_count,'bytes':len(data)},'mesh_bounds_blender_m':bounds,'manual_review_required':not reference,'sha256':hashlib.sha256(data).hexdigest()}

def main():
    p=argparse.ArgumentParser();p.add_argument('glb',type=Path);p.add_argument('--contract',type=Path,default=Path(__file__).resolve().parent.parent/'rules/constraints.json');p.add_argument('--manifest',type=Path);p.add_argument('--report',type=Path);p.add_argument('--reference',action='store_true');a=p.parse_args()
    try:
        c=json.loads(a.contract.read_text(encoding='utf-8'));m=json.loads(a.manifest.read_text(encoding='utf-8')) if a.manifest else None;report=inspect(a.glb.read_bytes(),c,m,a.reference)
    except (ValueError,KeyError,IndexError,TypeError,struct.error,OSError) as e:report={'automatic_pass':False,'errors':[str(e)],'scope':'GLB could not be inspected'}
    if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2));return 0 if report['automatic_pass'] else 1

if __name__=='__main__':sys.exit(main())
