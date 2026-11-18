from pathlib import Path
import bpy
from support import *

def tapered(parts,control,mat,rings,yfront,yback):
    verts,faces,roles=parts.groups.setdefault(control,([],[],[]))
    start=len(verts)
    for z,x in rings:verts.extend([(-x,yfront,z),(x,yfront,z),(x,yback,z),(-x,yback,z)])
    faces.append((start,start+3,start+2,start+1));roles.append(mat)
    for row in range(len(rings)-1):
        for side in range(4):
            a=start+row*4+side;b=start+row*4+(side+1)%4
            faces.append((a,b,b+4,a+4));roles.append(mat)
    top=start+(len(rings)-1)*4
    faces.append((top,top+1,top+2,top+3));roles.append(mat)

def build_female():
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
    parts=Parts({k:material('char_mat_'+k,v) for k,v in colors.items()})
    parts.parents['char_eyebrows']='char_head'
    box=parts.box
    # Straight black jacket, white V shirt, folded collar and long red tie.
    tapered(parts,'char_torso','clothing',[(.638,.24),(.78,.195),(.96,.22),(1.118,.23)],-.15,.15)
    box('char_torso','clothing',(0,0,1.066),(.64,.30,.086))
    # The top of the trousers belongs to the fixed pelvis/torso. Lower trouser
    # legs remain separate under the contract's low hip pivots at 0.42 m.
    for x in [-.125,.125]:
        box('char_torso','pants',(x,0,.538),(.24,.30,.236))
    parts.face('char_torso','shirt',[(-.105,1.112),(.105,1.112),(.065,.982),(0,.88),(-.065,.982)],-.156)
    parts.face('char_torso','shirt',[(-.111,1.113),(-.015,1.078),(-.061,1.013)],-.160)
    parts.face('char_torso','shirt',[(.111,1.113),(.015,1.078),(.061,1.013)],-.160)
    box('char_torso','tie',(0,-.17,1.068),(.047,.016,.044))
    parts.face('char_torso','tie',[(-.018,1.048),(.018,1.048),(.029,.902),(0,.866),(-.029,.902)],-.179)
    # Discrete black lapel planes; geometry, no painted light/shadow texture.
    parts.face('char_torso','clothing',[(-.127,1.105),(-.066,1.012),(-.084,.965),(-.155,1.059)],-.164)
    parts.face('char_torso','clothing',[(.127,1.105),(.066,1.012),(.084,.965),(.155,1.059)],-.164)
    # Square head and nose, with small ears. All geometry remains local to rig.
    box('char_head','skin',(0,0,1.14),(.15,.16,.12))
    tapered(parts,'char_head','skin',[(1.17,.225),(1.34,.27),(1.72,.27)],-.30,.27)
    for x in [-.286,.286]:box('char_head','skin',(x,0,1.40),(.036,.12,.12))
    box('char_head','skin',(0,-.318,1.365),(.064,.036,.054))
    for side,x in [('negx',-.385),('posx',.385)]:
        box('char_arm_'+side,'clothing',(x,0,.852),(.136,.26,.45))
        box('char_arm_'+side,'shirt',(x,-.002,.613),(.14,.264,.035))
        box('char_hand_'+side,'skin',(x,-.003,.552),(.14,.266,.087))
        lx=-.125 if side=='negx' else .125
        box('char_leg_'+side,'pants',(lx,0,.253),(.218,.30,.366))
        box('char_leg_'+side,'shoes',(lx,-.042,.040),(.224,.37,.080))
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
        parts.face('char_eyebrows','eyebrows',[(x+dx,1.482+dz) for dx,dz in brow],-.304)
    smile=[(-.080,1.301),(-.043,1.289),(0,1.286),(.043,1.289),(.080,1.301),(.060,1.271),(.030,1.252),(0,1.247),(-.030,1.252),(-.060,1.271)]
    parts.face('char_mouth','dark',smile,-.303)
    teeth=[(-.061,1.291),(-.03,1.283),(0,1.281),(.03,1.283),(.061,1.291),(.046,1.277),(0,1.269),(-.046,1.277)]
    parts.face('char_mouth','white',teeth,-.305)
    parts.finish()
    root=bpy.data.objects['char_root']
    root['asset_id']='female_base'
    root['contract']='AOP_CHAR_RIGID_1'
    root['design_revision']='female_modular_v01'
    root['intended_instance_scale']=1.0

