"""Export just one character hierarchy. Static GLB validation is mandatory afterwards."""
from pathlib import Path
import argparse,sys,bpy
KIT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--profile',choices=['human','agent','first_person'],required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=bpy.data.objects.get('fp_root' if a.profile=='first_person' else 'char_root')
if root is None:raise RuntimeError('Required root missing. One character per export scene; no .001 suffixes.')
objects=[root,*root.children_recursive]
if any(o.type not in ['EMPTY','MESH'] for o in objects):raise RuntimeError('Only rigid Empty/Mesh hierarchy allowed')
if any(o.animation_data and (o.animation_data.action or o.animation_data.nla_tracks) for o in objects):raise RuntimeError('Remove active actions/NLA: procedural profile has no clips')
if any(o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers) for o in objects):raise RuntimeError('No armature modifiers in rigid profile')
if any(o.type=='MESH' and o.data.shape_keys for o in objects):raise RuntimeError('No shape keys in rigid profile')
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
bpy.context.view_layer.objects.active=root
out=a.out if a.out.is_absolute() else KIT/a.out;out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,use_selection=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
print('EXPORTED_RUN_INSPECTOR_AND_REIMPORT',out)
