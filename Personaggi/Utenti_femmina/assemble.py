"""Load exactly one hair component under char_hair, without moving any control."""
import bpy
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mathutils import Matrix
from support import empty_scene,RES,material

def load_base(base):
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(base))
    return bpy.data.objects['char_root']

def attach_hair(component,style):
    anchor=bpy.data.objects['char_hair']
    for obj in list(anchor.children_recursive):
        if obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    if style=='bald':return
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(component))
    imported=set(bpy.data.objects)-before
    mesh=next(o for o in imported if o.type=='MESH')
    target=bpy.data.materials.get('char_mat_hair')
    if target is None:
        target=mesh.data.materials[0];target.name='char_mat_hair'
    mesh.data.materials.clear();mesh.data.materials.append(target)
    mesh.parent=anchor;mesh.matrix_parent_inverse=Matrix.Identity(4);mesh.matrix_basis=Matrix.Identity(4)
    mesh.name='char_hair_visual'
    for obj in imported:
        if obj!=mesh:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.view_layer.update()

if __name__=='__main__':
    import sys,argparse
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from package_core import export_avatar
    if not bpy.app.background or '--factory-startup' not in sys.argv:
        raise RuntimeError('Run in a separate --background --factory-startup process')
    ap=argparse.ArgumentParser();ap.add_argument('--base',type=Path,required=True);ap.add_argument('--component',type=Path,required=True)
    ap.add_argument('--style',required=True);ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    load_base(args.base);attach_hair(args.component,args.style)
    export_avatar(args.out,'assembled_avatar',args.style,reference_body=args.base)
