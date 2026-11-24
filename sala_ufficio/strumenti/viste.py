"""Blender -b -P strumenti/viste.py -- <kit>. Anteprime; non salva il .blend."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:]
root=Path(args[0]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(root/'ufficio.blend'))
s=bpy.context.scene
views=root/'riferimenti/viste';views.mkdir(exist_ok=True,parents=True)
bpy.data.collections['Soffitto | Vista in pianta'].hide_render=True
bpy.data.collections['VARIANTI | Attivare singolarmente'].hide_render=True
bpy.data.collections['GUIDE | Quote e interazioni'].hide_render=True
world=bpy.data.worlds.new('Anteprima_ambiente');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.7,.75,.8,1);bg.inputs['Strength'].default_value=.45;s.world=world
preview=bpy.data.collections.new('Anteprima_NON_ESPORTARE');s.collection.children.link(preview)
def light(name,pos,energy,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);preview.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
light('Anteprima_alto',(0,0,17),4200,24)
light('Anteprima_lato',(-14,-15,10),1800,14)
light('Anteprima_fronte',(8,14,11),2300,16)
camera_data=bpy.data.cameras.new('Anteprima_camera')
assert 'ORTHO' in [v.identifier for v in camera_data.bl_rna.properties['type'].enum_items]
camera_data.type='ORTHO';camera_data.clip_end=250
cam=bpy.data.objects.new('Anteprima_camera',camera_data);preview.objects.link(cam);s.camera=cam
s.render.resolution_x=1280;s.render.resolution_y=900;s.render.resolution_percentage=100
assert 'PNG' in [v.identifier for v in s.render.image_settings.bl_rna.properties['file_format'].enum_items]
s.render.image_settings.file_format='PNG';s.render.film_transparent=False
if hasattr(s,'eevee'):
    for p in ['taa_render_samples','taa_samples']:
        if hasattr(s.eevee,p):setattr(s.eevee,p,24)
setups=[
 ('vista_pianta',(0,-.01,49),(0,0,0),43),
 ('vista_generale',(-26,-32,37),(0,0,1),47),
 ('vista_scrivanie',(-14,-2,8),(-10.5,4.8,.5),12),
 ('vista_documenti',(-4,-1,4),(-4,-12.8,1.6),13.3),
 ('vista_capo_ufficio',(13.5,7,7),(13.5,-10,4.4),14),
 ('vista_fac­ciata',(-28,-35,16),(0,-5,2.8),46),
]
for name,pos,target,scale in setups:
    name=name.replace('\u00ad','')
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    camera_data.ortho_scale=scale;s.render.filepath=str(views/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    print('VISTA',name,flush=True)
