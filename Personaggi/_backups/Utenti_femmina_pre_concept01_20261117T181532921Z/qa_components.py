"""Blender roundtrip of each independent hair GLB, including the empty bald GLB."""
from pathlib import Path
import sys,argparse,json,hashlib
import bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from support import empty_scene,write_json
from contract_config import STYLES

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True)
    out=ap.parse_args(sys.argv[sys.argv.index('--')+1:]).out.resolve();results={}
    for style in STYLES:
        empty_scene();path=out/'hair'/('hair_'+style+'.glb')
        bpy.ops.import_scene.gltf(filepath=str(path))
        meshes=[o for o in bpy.data.objects if o.type=='MESH']
        roots=[o for o in bpy.data.objects if o.parent is None]
        errors=[]
        if len(roots)!=1:errors.append('root count')
        if len(meshes)!=(0 if style=='bald' else 1):errors.append('mesh count')
        for obj in bpy.data.objects:
            if obj.location.length>1e-6 or obj.matrix_local.to_quaternion().angle>1e-6 or max(abs(x-1) for x in obj.scale)>1e-6:errors.append('attachment transform')
        if meshes and [m.name for m in meshes[0].data.materials]!=['char_mat_hair']:errors.append('material')
        results[style]={'status':'FAIL' if errors else 'PASS','errors':errors,'meshes':len(meshes),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    write_json(out/'COMPONENT_ROUNDTRIP.json',{'status':'PASS' if all(v['status']=='PASS' for v in results.values()) else 'FAIL','components':results})
    print(json.dumps(results))

if __name__=='__main__':main()
