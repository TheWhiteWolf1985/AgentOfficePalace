"""Independent GLB comparisons and semantic material checks; standard library only."""
from pathlib import Path
from collections import Counter,defaultdict
import json,sys,struct,math,hashlib,copy
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'resources'))
from glb_common import parse,local,mul,transform
from inspect_character import inspect

REQUESTED_ROLES={'skin':'char_mat_skin','hair':'char_mat_hair','eyebrows':'char_mat_eyebrows',
                 'iris':'char_mat_iris','clothing':'char_mat_clothing','shirt':'char_mat_shirt',
                 'tie':'char_mat_tie','pants':'char_mat_pants','shoes':'char_mat_shoes'}
EXPECTED_STRICT_ERRORS={'Budget exceeded: primitives','Budget exceeded: materials',
                        'Manifest deviations require separate review; not an in-contract PASS'}
POSES={
 'rest':{},
 'walk_a':{'char_arm_negx':.70,'char_arm_posx':-.70,'char_leg_negx':-.70,'char_leg_posx':.70},
 'walk_b':{'char_arm_negx':-.70,'char_arm_posx':.70,'char_leg_negx':.70,'char_leg_posx':-.70},
 'sit':{'char_leg_negx':-1.35,'char_leg_posx':-1.35,'char_arm_negx':-.55,'char_arm_posx':-.55},
 'hold':{'char_arm_negx':-1.65},'paper_book':{'char_arm_negx':-1.20,'char_arm_posx':-1.20},
 'ladder':{'char_arm_negx':-2.80,'char_arm_posx':-2.80,'char_leg_negx':-.70},
 'pole':{'char_arm_negx':-2.40,'char_arm_posx':-2.80,'char_leg_posx':-.70}}

class Asset:
    def __init__(self,path):
        self.path=Path(path);self.data=self.path.read_bytes();self.g,self.binary=parse(self.data)
        self.parents={c:i for i,n in enumerate(self.g['nodes']) for c in n.get('children',[])}
        self.lookup={n['name']:i for i,n in enumerate(self.g['nodes'])}
    def values(self,index):
        a=self.g['accessors'][index];v=self.g['bufferViews'][a['bufferView']]
        fmt,size={5121:('B',1),5123:('H',2),5125:('I',4),5126:('f',4)}[a['componentType']]
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size*count)
        return [struct.unpack_from('<'+fmt*count,self.binary,start+i*stride) for i in range(a['count'])]
    def matrices(self,pose):
        world={}
        def matrix(i):
            if i in world:return world[i]
            n=copy.deepcopy(self.g['nodes'][i])
            if n['name'] in pose:
                angle=pose[n['name']];n['rotation']=[math.sin(angle/2),0,0,math.cos(angle/2)]
            m=local(n)
            if i in self.parents:m=mul(matrix(self.parents[i]),m)
            world[i]=m;return m
        for i in range(len(self.g['nodes'])):matrix(i)
        return world
    def triangles(self,pose=None):
        matrices=self.matrices(pose or {})
        for i,node in enumerate(self.g['nodes']):
            if 'mesh' not in node:continue
            m=matrices[i]
            for primitive in self.g['meshes'][node['mesh']]['primitives']:
                points=self.values(primitive['attributes']['POSITION'])
                normals=self.values(primitive['attributes']['NORMAL'])
                ids=[x[0] for x in self.values(primitive['indices'])] if 'indices' in primitive else list(range(len(points)))
                material=self.g['materials'][primitive['material']]
                pbr=material.get('pbrMetallicRoughness',{})
                shader=(tuple(pbr.get('baseColorFactor',[1,1,1,1])),pbr.get('roughnessFactor',1),pbr.get('metallicFactor',1),material.get('alphaMode','OPAQUE'),material.get('doubleSided',False))
                for j in range(0,len(ids),3):
                    vertices=[]
                    for index in ids[j:j+3]:
                        point=transform(m,points[index]);normal=normals[index]
                        n=[sum(m[r][c]*normal[c] for c in range(3)) for r in range(3)]
                        vertices.append(tuple(round(x,6) for x in point+n))
                    yield node['name'],material['name'],tuple(sorted(vertices)),shader
    def signatures(self,pose=None):
        return Counter((vertices,shader) for _,_,vertices,shader in self.triangles(pose))
    def ancestor(self,name,target):
        i=self.lookup[name]
        while True:
            if self.g['nodes'][i]['name']==target:return True
            if i not in self.parents:return False
            i=self.parents[i]

def run(folder):
    folder=Path(folder)
    old=Asset(HERE/'resources/baseline_human_base.glb');new=Asset(folder/'human_base.glb')
    contract=json.loads((HERE/'resources/constraints.json').read_text(encoding='utf8'))
    manifest=json.loads((folder/'human_base.manifest.json').read_text(encoding='utf8'))
    strict=inspect(new.data,contract,'human',manifest)
    checks={}
    checks['strict_failures_limited_to_declared_deviations']='PASS' if set(strict['errors'])==EXPECTED_STRICT_ERRORS else 'FAIL'
    controls={}
    for name in contract['profiles']['human']['nodes']:
        a=old.g['nodes'][old.lookup[name]];b=new.g['nodes'][new.lookup[name]]
        get_parent=lambda asset,n:asset.g['nodes'][asset.parents[asset.lookup[n]]]['name'] if asset.lookup[n] in asset.parents else None
        same=get_parent(old,name)==get_parent(new,name)
        same &= all(a.get(key,default)==b.get(key,default) for key,default in [('translation',[0,0,0]),('rotation',[0,0,0,1]),('scale',[1,1,1])])
        controls[name]='PASS' if same else 'FAIL'
    checks['controls_and_pivots_unchanged']='PASS' if all(x=='PASS' for x in controls.values()) else 'FAIL'
    comparisons={}
    for name,pose in POSES.items():
        a=old.signatures(pose);b=new.signatures(pose)
        missing=sum((a-b).values());added=sum((b-a).values())
        comparisons[name]={'status':'PASS' if not missing and not added else 'FAIL','original_triangles':sum(a.values()),'new_triangles':sum(b.values()),'missing':missing,'added':added}
    checks['geometry_normals_and_initial_shader_unchanged_in_all_poses']='PASS' if all(x['status']=='PASS' for x in comparisons.values()) else 'FAIL'
    uses=defaultdict(Counter)
    for node,mat,_,_ in new.triangles():uses[mat][node]+=1
    names={m['name'] for m in new.g['materials']}
    checks['nine_distinct_required_materials']='PASS' if len(set(REQUESTED_ROLES.values()))==9 and set(REQUESTED_ROLES.values())<=names and all(manifest['material_roles'].get(k)==v for k,v in REQUESTED_ROLES.items()) else 'FAIL'
    checks['pants_including_upper_part']='PASS' if set(uses['char_mat_pants'])=={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'} and not any(n.startswith('char_leg_') for n in uses['char_mat_clothing']) else 'FAIL'
    checks['shoes_not_used_by_face']='PASS' if set(uses['char_mat_shoes'])=={'char_leg_negx_visual','char_leg_posx_visual'} and all(not n.startswith('char_leg_') for n in uses['char_mat_dark']) else 'FAIL'
    eyebrow='char_eyebrows_visual'
    checks['eyebrows_follow_head_not_hair']='PASS' if new.ancestor(eyebrow,'char_head') and not new.ancestor(eyebrow,'char_hair') and set(uses['char_mat_eyebrows'])=={eyebrow} else 'FAIL'
    checks['hair_replaceable_separate']='PASS' if set(uses['char_mat_hair'])=={'char_hair_visual'} and new.ancestor('char_hair_visual','char_hair') else 'FAIL'
    # Count boundary edges of the underlying head after welding export-split vertices.
    edges=Counter()
    for node,_,vertices,_ in new.triangles():
        if node!='char_head_visual':continue
        p=[x[:3] for x in vertices]
        for a,b in [(p[0],p[1]),(p[1],p[2]),(p[2],p[0])]:edges[tuple(sorted((a,b)))]+=1
    boundary=sum(v!=2 for v in edges.values())
    checks['full_closed_head_under_hair']='PASS' if edges and not boundary else 'FAIL'
    root=new.g['nodes'][new.lookup['char_root']]
    checks['unit_scale_feet_origin']='PASS' if root.get('translation',[0,0,0])==[0,0,0] and root.get('scale',[1,1,1])==[1,1,1] and abs(strict['metrics']['bounds_min'][1])<1e-7 else 'FAIL'
    return {'status':'PASS' if all(x=='PASS' for x in checks.values()) else 'FAIL','scope':'Requested revision, unchanged rig/geometry/color and separation semantics; this does not turn the original budget FAIL into PASS.',
            'checks':checks,'strict_original_contract':strict,'controls':controls,'pose_comparisons':comparisons,
            'triangle_signature_tolerance_decimal_places':6,'underlying_head_nonclosed_edges':boundary,
            'material_bindings':{m:dict(v) for m,v in sorted(uses.items())},'baseline_sha256':hashlib.sha256(old.data).hexdigest()}

if __name__=='__main__':
    result=run(Path(sys.argv[1]) if len(sys.argv)>1 else HERE)
    print(json.dumps(result,indent=2))
    sys.exit(0 if result['status']=='PASS' else 1)
