"""Reimport final GLB, independently recolor nine channels and hide/replace hair.

Run in a fresh background Blender with -- --out GENERATED_DIRECTORY.
The visible baseline is reconstructed from the preserved original GLB.
"""
from pathlib import Path
import sys,argparse,json,math,hashlib
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from voxel_support import empty_scene,stage,camera_at,render,write_json,pose
from qa_glb import REQUESTED_ROLES,run as compare_glb
from contact_sheets import sheet

def setup(path):
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(path))
    stage()
    camera_at('Review_camera',(3,-5,2.3),(0,0,.88),2.12)

def view(kind):
    cam=bpy.context.scene.camera
    if kind=='face':position=(0,-5,1.445);target=(0,0,1.445);scale=.86
    elif kind=='front':position=(0,-5,.89);target=(0,0,.88);scale=2.12
    elif kind=='side':position=(5,0,.89);target=(0,0,.88);scale=2.12
    elif kind=='back':position=(0,5,.89);target=(0,0,.88);scale=2.12
    else:position=(3,-5,2.3);target=(0,0,.88);scale=2.12
    cam.location=position
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale

def hide_hair():
    objects=bpy.data.objects['char_hair'].children_recursive
    for obj in objects:obj.hide_render=True

def channel_snapshot():
    return {m.name:tuple(next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].default_value)
            for m in bpy.data.materials if m.name.startswith('char_mat_')}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True)
    out=ap.parse_args(sys.argv[sys.argv.index('--')+1:]).out.resolve()
    views=out/'views';views.mkdir(exist_ok=True)
    setup(HERE/'resources/baseline_human_base.glb')
    for kind in ['front','side','back','three_quarter','face']:
        view(kind);render(views/('before_'+kind+'.png'))
    hide_hair();view('face');render(views/'before_hair_hidden.png')
    setup(out/'human_base.glb')
    result={'source_glb_sha256':hashlib.sha256((out/'human_base.glb').read_bytes()).hexdigest(),
            'scope':'Blender GLB roundtrip only; application/controller and renderer QA remain NOT_RUN.',
            'checks':{},'color_channels':{}}
    original=channel_snapshot()
    for role,name in REQUESTED_ROLES.items():
        mat=bpy.data.materials[name]
        node=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        node.inputs['Base Color'].default_value=(.82,.018,.55,1)
        changed=channel_snapshot()
        actual=sorted(k for k in original if original[k]!=changed[k])
        result['color_channels'][role]={'status':'PASS' if actual==[name] else 'FAIL','material':name,'changed_materials':actual}
        view('three_quarter');render(views/('color_'+role+'.png'))
        if role in ['eyebrows','iris']:
            view('face');render(views/('color_'+role+'_closeup.png'))
        node.inputs['Base Color'].default_value=original[name]
        assert channel_snapshot()==original,'Color restoration failed: '+role
    result['checks']['independent_nine_color_channels']='PASS' if all(x['status']=='PASS' for x in result['color_channels'].values()) else 'FAIL'
    result['checks']['initial_colors_restored']='PASS' if channel_snapshot()==original else 'FAIL'
    for kind in ['front','side','back','three_quarter','face']:
        view(kind);render(views/('after_'+kind+'.png'))
    hair=bpy.data.objects['char_hair']
    brows=bpy.data.objects['char_eyebrows_visual']
    head=bpy.data.objects['char_head_visual']
    hide_hair()
    result['checks']['hair_hidden_brows_and_head_visible']='PASS' if not brows.hide_render and not head.hide_render and all(o.hide_render for o in hair.children_recursive) else 'FAIL'
    view('face');render(views/'after_hair_hidden.png')
    view('three_quarter');render(views/'hair_hidden_three_quarter.png')
    # Replacing the hairstyle is simulated by temporarily detaching its existing
    # visual mesh. No new hairstyle or new geometry is introduced.
    visual=bpy.data.objects['char_hair_visual'];parent=visual.parent
    visual.parent=None
    result['checks']['hair_detach_does_not_detach_brows']='PASS' if brows.parent.name=='char_head' and not brows.hide_render else 'FAIL'
    visual.parent=parent
    bpy.context.view_layer.update()
    head_control=bpy.data.objects['char_head'];head_control.rotation_mode='XYZ'
    before=brows.matrix_world.copy()
    head_control.rotation_euler.z=.35
    bpy.context.view_layer.update()
    delta=max(abs(brows.matrix_world[i][j]-before[i][j]) for i in range(4) for j in range(4))
    result['checks']['brows_follow_rotated_head']='PASS' if delta>.1 and brows.parent==head_control else 'FAIL'
    view('face');render(views/'hair_hidden_head_turn.png')
    head_control.rotation_euler=(0,0,0)
    for o in hair.children_recursive:o.hide_render=False
    bpy.context.view_layer.update()
    # Each pose was actually applied, not only assigned to an inactive Euler mode.
    result['poses']={}
    for name in ['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        angles={n:bpy.data.objects[n].matrix_local.to_quaternion().angle for n in ['char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx']}
        ok=name=='rest' or any(a>.1 for a in angles.values())
        result['poses'][name]={'status':'PASS' if ok else 'FAIL','actual_rotation_angles':angles}
    pose('rest')
    result['checks']['pose_execution']='PASS' if all(x['status']=='PASS' for x in result['poses'].values()) else 'FAIL'
    result['status']='PASS' if all(x=='PASS' for x in result['checks'].values()) else 'FAIL'
    write_json(out/'BLENDER_QA.json',result)
    comparison=compare_glb(out)
    write_json(out/'GEOMETRY_COMPARISON.json',comparison)
    assert result['status']=='PASS' and comparison['status']=='PASS',(result,comparison)
    for kind in ['front','side','back','three_quarter','face']:
        sheet([views/('before_'+kind+'.png'),views/('after_'+kind+'.png')],views/('comparison_'+kind+'.png'),2,650)
    sheet([views/'before_hair_hidden.png',views/'after_hair_hidden.png'],views/'comparison_hair_hidden.png',2,650)
    sheet([views/('color_'+role+'.png') for role in REQUESTED_ROLES],views/'color_channels.png',3,400)
    print('MATERIAL_AND_HAIR_QA_PASS',out,flush=True)

if __name__=='__main__':main()
