"""Build the first human user avatar at unit scale, in a fresh background Blender.

blender --background --factory-startup --python build_scene.py -- --out review
All local geometry and all required modules are included. No network input.
"""
from pathlib import Path
import argparse,sys,json,math,hashlib
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from voxel_support import (RES,CONTRACT,Parts,empty_scene,material,camera_at,stage,
                           render,export,reimport_asset,pose,write_json)

ASSET='human_base'

def build_character():
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(RES/'starter_human.glb'))
    for obj in list(bpy.data.objects):
        if obj.type=='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    bpy.context.view_layer.update()
    colors={
        'skin':(.73,.46,.27),
        'clothing':(.009,.012,.018),
        'hair':(.30,.19,.082),
        'shirt':(.9,.91,.9),
        'accent':(.48,.008,.012),
        'dark':(.004,.006,.01),
        'white':(.95,.97,1),
        'iris':(.018,.20,.48),
    }
    parts=Parts({k:material('char_mat_'+k,v) for k,v in colors.items()})
    box=parts.box
    # Straight black jacket, white V shirt, folded collar and long red tie.
    box('char_torso','clothing',(0,0,.878),(.46,.30,.48))
    box('char_torso','clothing',(0,0,1.066),(.64,.30,.086))
    # The top of the trousers belongs to the fixed pelvis/torso. Lower trouser
    # legs remain separate under the contract's low hip pivots at 0.42 m.
    for x in [-.125,.125]:
        box('char_torso','clothing',(x,0,.538),(.23,.30,.236))
    parts.face('char_torso','shirt',[(-.105,1.112),(.105,1.112),(.065,.982),(0,.88),(-.065,.982)],-.156)
    parts.face('char_torso','shirt',[(-.111,1.113),(-.015,1.078),(-.061,1.013)],-.160)
    parts.face('char_torso','shirt',[(.111,1.113),(.015,1.078),(.061,1.013)],-.160)
    box('char_torso','accent',(0,-.17,1.068),(.047,.016,.044))
    parts.face('char_torso','accent',[(-.018,1.048),(.018,1.048),(.029,.902),(0,.866),(-.029,.902)],-.179)
    # Discrete black lapel planes; geometry, no painted light/shadow texture.
    parts.face('char_torso','clothing',[(-.127,1.105),(-.066,1.012),(-.084,.965),(-.155,1.059)],-.164)
    parts.face('char_torso','clothing',[(.127,1.105),(.066,1.012),(.084,.965),(.155,1.059)],-.164)
    # Square head and nose, with small ears. All geometry remains local to rig.
    box('char_head','skin',(0,0,1.14),(.15,.16,.12))
    box('char_head','skin',(0,-.015,1.445),(.54,.57,.55))
    for x in [-.286,.286]:box('char_head','skin',(x,0,1.40),(.036,.12,.12))
    box('char_head','skin',(0,-.318,1.365),(.064,.036,.054))
    for side,x in [('negx',-.385),('posx',.385)]:
        box('char_arm_'+side,'clothing',(x,0,.852),(.136,.26,.45))
        box('char_arm_'+side,'shirt',(x,-.002,.613),(.14,.264,.035))
        box('char_hand_'+side,'skin',(x,-.003,.552),(.14,.266,.087))
        lx=-.125 if side=='negx' else .125
        box('char_leg_'+side,'clothing',(lx,0,.253),(.23,.30,.366))
        box('char_leg_'+side,'dark',(lx,-.042,.040),(.234,.39,.080))
    # Humanized eyes and smile, matching the approved direction of the NPCs.
    eye_shape=[(-.076,0),(-.052,.026),(-.02,.035),(.018,.034),(.052,.023),(.076,0),(.047,-.021),(.012,-.028),(-.026,-.026),(-.054,-.016)]
    brow=[(-.067,-.003),(-.034,.010),(.005,.014),(.042,.008),(.065,-.002),(.037,.001),(.002,.005),(-.033,.001)]
    for side,x in [('negx',-.12),('posx',.12)]:
        eye='char_eye_'+side
        parts.face(eye,'dark',[(x+dx,1.414+dz) for dx,dz in eye_shape],-.303)
        parts.face(eye,'white',[(x+dx*.92,1.414+dz*.78-.001) for dx,dz in eye_shape],-.305)
        parts.ellipse(eye,'iris',x,1.414,.025,.025,-.307)
        parts.ellipse(eye,'dark',x,1.414,.011,.017,-.309)
        parts.ellipse(eye,'white',x-.008,1.425,.006,.006,-.311,12)
        parts.face('char_hair','hair',[(x+dx,1.482+dz) for dx,dz in brow],-.304)
    smile=[(-.080,1.301),(-.043,1.289),(0,1.286),(.043,1.289),(.080,1.301),(.060,1.271),(.030,1.252),(0,1.247),(-.030,1.252),(-.060,1.271)]
    parts.face('char_mouth','dark',smile,-.303)
    teeth=[(-.061,1.291),(-.03,1.283),(0,1.281),(.03,1.283),(.061,1.291),(.046,1.277),(0,1.269),(-.046,1.277)]
    parts.face('char_mouth','white',teeth,-.305)
    # Short light-brown voxel hair, side swept, no long bob or reception styling.
    box('char_hair','hair',(0,-.012,1.738),(.586,.606,.055))
    box('char_hair','hair',(0,.281,1.586),(.586,.045,.25))
    for x in [-.282,.282]:
        box('char_hair','hair',(x,-.005,1.615),(.064,.58,.245))
    for x,width,bottom in [(-.245,.096,1.50),(-.147,.10,1.53),(-.049,.10,1.59),(.049,.10,1.63),(.147,.10,1.59),(.245,.096,1.54)]:
        box('char_hair','hair',(x,-.311,(bottom+1.72)/2),(width,.034,1.72-bottom))
    parts.finish()
    root=bpy.data.objects['char_root']
    root['asset_id']=ASSET
    root['contract']='AOP_CHAR_RIGID_1'
    root['design_revision']='human_base_voxel_v01'
    root['intended_instance_scale']=1.0

def automated_qa():
    # Run on the final GLB already reimported by reimport_asset().
    q={}
    root=bpy.data.objects['char_root']
    q['unit_scale']='PASS' if all(abs(x-1)<1e-6 for x in root.scale) and root.location.length<1e-6 else 'FAIL'
    for name in ['walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        moved=any(bpy.data.objects[n].matrix_local.to_quaternion().angle>.1 for n in ['char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx'])
        finite=all(math.isfinite(v) for o in root.children_recursive for row in o.matrix_world for v in row)
        q['pose_'+name]='PASS' if moved and finite else 'FAIL'
    pose('rest')
    hidden=[o for n in ['char_head','char_arm_negx','char_arm_posx'] for o in bpy.data.objects[n].children_recursive if o.type=='MESH']
    for o in hidden:o.hide_render=True
    remaining={o.name for o in root.children_recursive if o.type=='MESH' and not o.hide_render}
    q['hide_head_and_arms']='PASS' if remaining=={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'} else 'FAIL'
    for o in hidden:o.hide_render=False
    return q

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=HERE/'review')
    parser.add_argument('--skip-views',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if not bpy.app.background or '--factory-startup' not in sys.argv:
        raise RuntimeError('Use a fresh Blender --background --factory-startup process')
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    views=out/'views';views.mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    build_character()
    contract_result=export(out,ASSET)
    # An authoring scene containing one character and only a photography stage.
    stage()
    camera_at('Review_camera',(2.6,-4.5,2.4),(0,0,.88),2.12)
    bpy.context.scene.name='Human_Base_V01'
    bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'human_base.blend'))
    report={'contract':contract_result,'instance_scale':1.0,'rig_profile':'human'}
    if not args.skip_views:
        report['roundtrip']=reimport_asset(out,ASSET,views)
        report['automated_qa']=automated_qa()
        assert all(v=='PASS' for v in report['automated_qa'].values()),report
        camera=bpy.context.scene.camera
        camera.location=(3,-5,2.3)
        camera.rotation_euler=(Vector((0,0,.88))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=2.12
        bpy.context.scene.name='Human_Base_V01_Review'
        bpy.context.scene.render.filepath='//views/'
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'human_base.review.blend'))
        camera.location=(0,-5,1.445)
        camera.rotation_euler=(Vector((0,0,1.445))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale=.86
        render(views/'face_closeup.png')
        from contact_sheets import sheet
        poses=['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']
        sheet([views/(ASSET+'_pose_'+p+'.png') for p in poses],views/'poses.png',4,400)
    write_json(out/'BUILD_REPORT.json',report)
    write_json(out/'VALIDATION.json',{
        'contract':'AOP_CHAR_RIGID_1','profile':'human','asset_id':ASSET,'design_revision':'human_base_voxel_v01',
        'status':'NOT_RUN','purpose':'First visual iteration for Juri review, no software integration',
        'blender_version':bpy.app.version_string,'instance_scale':1.0,
        'checks':{'glb_contract':contract_result['status'],
                  'reimport_blender':report.get('roundtrip',{}).get('status','NOT_RUN'),
                  'rotation_and_visibility':'NOT_RUN' if args.skip_views else 'PASS',
                  'manual_geometry':'NOT_RUN','manual_all_poses':'NOT_RUN','runtime_application':'NOT_RUN','artistic_approval':'NOT_RUN'},
        'limitations':['Only human_base is created; agent and first-person hands are not included.',
                       'Procedural rigid controls are retained; no skinning, armature, clips or root motion.',
                       'No reception placement and no 1.15 multiplier. Render-stage ground/cameras/lights are excluded from the GLB.']})
    print('HUMAN_BASE_BUILD_COMPLETED',out,flush=True)

if __name__=='__main__':main()
