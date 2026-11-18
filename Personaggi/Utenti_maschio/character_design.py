"""Approved Concept 01 male design, rigid controls and independent colors.

blender --background --factory-startup --python build_scene.py -- --out review
All local geometry and all required modules are included. No network input.
"""
from pathlib import Path
import argparse,sys,json,math,hashlib
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from support import RES,CONTRACT,Parts,empty_scene,material

ASSET='human_base'
from concept_style import PALETTE,jacket_front,temple_marks

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
        'tie':(.48,.008,.012),
        'dark':(.004,.006,.01),
        'white':(.95,.97,1),
        'iris':(.018,.20,.48),
        'eyebrows':(.30,.19,.082),
        'pants':(.009,.012,.018),
        'shoes':(.004,.006,.01),
    }
    colors={k:PALETTE[k] for k in colors};colors['accent']=PALETTE['accent']
    parts=Parts({k:material('char_mat_'+k,v) for k,v in colors.items()})
    parts.parents['char_eyebrows']='char_head'
    box=parts.box
    # Straight black jacket, white V shirt, folded collar and long red tie.
    box('char_torso','clothing',(0,0,.878),(.46,.30,.48))
    box('char_torso','clothing',(0,0,1.066),(.64,.30,.086))
    # The top of the trousers belongs to the fixed pelvis/torso. Lower trouser
    # legs remain separate under the contract's low hip pivots at 0.42 m.
    for x in [-.125,.125]:
        box('char_torso','pants',(x,0,.538),(.23,.30,.236))
    jacket_front(parts,female=False)
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
        box('char_leg_'+side,'pants',(lx,0,.253),(.23,.30,.366))
        box('char_leg_'+side,'shoes',(lx,-.042,.040),(.234,.39,.080))
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
        parts.face('char_eyebrows','eyebrows',[(x+dx,1.482+dz*2.0) for dx,dz in brow],-.304)
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
    temple_marks(parts)
    parts.finish()
    root=bpy.data.objects['char_root']
    root['asset_id']=ASSET
    root['contract']='AOP_CHAR_RIGID_1'
    root['design_revision']='human_male_concept01_v01'
    root['intended_instance_scale']=1.0
