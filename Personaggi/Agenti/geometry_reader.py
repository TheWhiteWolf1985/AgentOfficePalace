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

