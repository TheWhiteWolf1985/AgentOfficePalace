"""Render delle tre viste della bozza effettiva. Eseguire sul .blend sorgente."""
from pathlib import Path
import bpy

kit=Path(__file__).resolve().parent.parent
scene=bpy.data.scenes['AOP_Sala_Riunioni_v01']
bpy.context.window.scene=scene
dest=kit/'delivery/views'
dest.mkdir(parents=True,exist_ok=True)
scene.render.resolution_percentage=100
views=[('entrance','preview_camera_entrance'),('whiteboard_from_seat','preview_camera_whiteboard_from_seat'),('top','preview_camera_top')]
if 'preview_camera_lounge' in bpy.data.objects:views.append(('lounge','preview_camera_lounge'))
for name,cam in views:
    scene.camera=bpy.data.objects[cam]
    hidden=[]
    if name=='top':
        hidden=[ob for ob in scene.objects if ob.name.startswith(('ceiling_','pendant_','lounge_pendant_'))]
        for ob in hidden: ob.hide_render=True
    scene.render.filepath=str(dest/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob in hidden: ob.hide_render=False
print('Viste prodotte; top con soffitto e sospensioni temporaneamente esclusi solo dal render.')
