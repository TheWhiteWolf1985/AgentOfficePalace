"""Render final comparative views and a safe standalone review .blend."""
from pathlib import Path
import sys,argparse,json
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from support import empty_scene,stage,camera_at,render,write_json
from hair_design import STYLES
from package_core import ROLES
from contact_sheets import sheet

def scene(path,width=700):
    empty_scene();bpy.ops.import_scene.gltf(filepath=str(path));stage(width,width)
    return camera_at('Review_camera',(3,-5,2.3),(0,0,.9),2.25)

def aim(cam,pos,target,scale):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True)
    out=ap.parse_args(sys.argv[sys.argv.index('--')+1:]).out.resolve();v=out/'views'
    bpy.context.preferences.filepaths.save_version=0
    (v/'side').mkdir(exist_ok=True);(v/'back').mkdir(exist_ok=True)
    for base in ['male','female']:
        for style in STYLES:
            cam=scene(out/'assemblies'/(base+'_'+style+'.glb'),480)
            aim(cam,(5,0,1.25),(0,0,1.25),1.65);render(v/'side'/(base+'_'+style+'.png'))
            aim(cam,(0,5,1.25),(0,0,1.25),1.65);render(v/'back'/(base+'_'+style+'.png'))
    cam=scene(out/'female_base.glb',1000)
    for name,pos in [('front',(0,-5,.9)),('side',(5,0,.9)),('back',(0,5,.9)),('three_quarter',(3,-5,2.3))]:
        aim(cam,pos,(0,0,.9),2.12);render(v/(name+'.png'))
    aim(cam,(0,-5,1.445),(0,0,1.445),.86);render(v/'female_face.png')
    aim(cam,(2.8,-4,1.2),(0,0,.38),.95);render(v/'skirt_heels_detail.png')
    aim(cam,(4,0,.26),(0,0,.26),.70);render(v/'heels_side_detail.png')
    bpy.context.scene.name='Female_Base_Short_Review'
    aim(cam,(3,-5,2.3),(0,0,.9),2.12)
    bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'female_base.review.blend'))
    bpy.context.scene.render.resolution_x=480;bpy.context.scene.render.resolution_y=480
    for role,name in list(ROLES.items())[:9]:
        node=next(n for n in bpy.data.materials[name].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        old=tuple(node.inputs['Base Color'].default_value);node.inputs['Base Color'].default_value=(.82,.018,.55,1)
        render(v/('color_'+role+'.png'));node.inputs['Base Color'].default_value=old
    for o in bpy.data.objects['char_head'].children_recursive:
        if o.type=='MESH':o.hide_render=True
    for control in ['char_arm_negx','char_arm_posx']:
        for o in bpy.data.objects[control].children_recursive:
            if o.type=='MESH':o.hide_render=True
    render(v/'first_person_visibility.png')
    empty_scene()
    for i,base in enumerate(['male','female']):
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(out/'assemblies'/(base+'_short.glb')))
        imported=set(bpy.data.objects)-before
        for obj in imported:
            if obj.parent not in imported:obj.location.x=(-.65 if i==0 else .65)
    stage(1400,1000);camera_at('Review_camera',(2.7,-7,2.5),(0,0,.9),3.3)
    render(v/'male_female_comparison.png')
    bpy.context.scene.name='Male_Reference_And_Female_Base'
    bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'comparison.review.blend'))
    for folder,filename in [('styles','styles_comparison.png'),('side','styles_side_comparison.png'),('back','styles_back_comparison.png')]:
        sheet([v/folder/(base+'_'+style+'.png') for base in ['male','female'] for style in STYLES],v/filename,7,300)
    for base in ['male','female']:
        for style in STYLES:
            names=['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']
            sheet([v/'poses'/(base+'_'+style+'_'+name+'.png') for name in names],v/'poses'/(base+'_'+style+'_sheet.png'),4,300)
        sheet([v/'poses'/(base+'_'+style+'_'+name+'.png') for style in STYLES for name in names],v/(base+'_pose_overview.png'),8,240)
    sheet([v/('color_'+role+'.png') for role in list(ROLES)[:9]],v/'nine_color_channels.png',3,350)
    print('PRESENTATION_DONE',out,flush=True)

if __name__=='__main__':main()
