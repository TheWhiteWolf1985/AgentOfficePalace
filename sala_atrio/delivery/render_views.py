"""Render delle sole viste della bozza; -- --quick per una prova piccola.

blender --background work/v02/atrium.blend --python work/render_views.py
"""
from pathlib import Path
import argparse
import sys
import bpy

scene=bpy.context.scene
assert scene.name.startswith('AOP_Sala_Atrio_'),scene.name
bpy.context.window.scene=scene
output=Path(bpy.data.filepath).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--quick',action='store_true')
p.add_argument('--views',default='entrance,reception,top')
args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
quick=args.quick
views=output/('preview' if quick else 'views');views.mkdir(exist_ok=True)
scene.cycles.samples=10 if quick else 16
scene.cycles.max_bounces=6
scene.cycles.diffuse_bounces=3
scene.cycles.glossy_bounces=3
for name in (['entrance'] if quick else args.views.split(',')):
    assert name in ['entrance','reception','top'],name
    camera=bpy.data.objects['atrio_preview_camera_'+name]
    assert camera.type=='CAMERA',camera.name
    scene.camera=camera
    hidden={}
    if name=='top':
        for o in bpy.data.objects['atrio_ceiling'].children_recursive:
            hidden[o.name]=o.hide_render;o.hide_render=True
        scene.render.resolution_x=1280;scene.render.resolution_y=980
    else:
        scene.render.resolution_x=640 if quick else 1280
        scene.render.resolution_y=400 if quick else 800
    scene.render.resolution_percentage=100
    scene.render.filepath=str(views/(name+'.png'))
    bpy.ops.render.render(write_still=True,scene=scene.name)
    for n,value in hidden.items():bpy.data.objects[n].hide_render=value
    print('RENDER_DONE',name,flush=True)
