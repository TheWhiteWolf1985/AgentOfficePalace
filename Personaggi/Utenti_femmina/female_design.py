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

def shifted_sleeve(parts,x):
    vertices,faces,roles=parts.groups.setdefault('char_arm_negx' if x<0 else 'char_arm_posx',([],[],[]))
    start=len(vertices);rings=[(.628,.050),(.875,.060),(1.077,.065)]
    for z,w in rings:vertices.extend([(x-w,-.115,z),(x+w,-.115,z),(x+w,.115,z),(x-w,.115,z)])
    faces.append((start,start+3,start+2,start+1));roles.append('clothing')
    for r in range(2):
        for i in range(4):
            a=start+r*4+i;b=start+r*4+(i+1)%4
            faces.append((a,b,b+4,a+4));roles.append('clothing')
    faces.append((start+8,start+9,start+10,start+11));roles.append('clothing')

def bow_loop(parts,outline):
    vertices,faces,roles=parts.groups.setdefault('char_bow',([],[],[]))
    start=len(vertices);count=len(outline)
    for y in [-.381,-.354]:vertices.extend((x,y,z) for x,z in outline)
    area=sum(outline[i][0]*outline[(i+1)%count][1]-outline[(i+1)%count][0]*outline[i][1] for i in range(count))
    order=list(range(count))
    if area<0:order.reverse()
    faces.append(tuple(start+i for i in order));roles.append('bow')
    faces.append(tuple(start+count+i for i in reversed(order)));roles.append('bow')
    for i in range(count):
        j=(i+1)%count;faces.append((start+i,start+j,start+count+j,start+count+i));roles.append('bow')

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
        'bow':(.48,.008,.012),
    }
    parts=Parts({k:material('char_mat_'+k,v) for k,v in colors.items()})
    parts.parents['char_eyebrows']='char_head'
    parts.parents['char_bow']='char_head'
    box=parts.box
    # Straight black jacket, white V shirt, folded collar and long red tie.
    tapered(parts,'char_torso','clothing',[(.710,.20),(.80,.18),(.97,.21),(1.095,.215)],-.15,.15)
    box('char_torso','clothing',(0,0,1.06),(.63,.30,.070))
    box('char_torso','shirt',(0,0,.70),(.385,.295,.040))
    # Juri correction: skirt and heels, like the Atrium NPCs. Keep the exact
    # pants color-channel ID for the skirt; no trousers remain on this base.
    # The hem ends at the original 0.42 m hip pivot, leaving the legs free.
    tapered(parts,'char_torso','pants',[(.425,.265),(.56,.25),(.690,.195)],-.17,.17)
    parts.face('char_torso','shirt',[(-.095,1.10),(.095,1.10),(.072,.995),(.032,.95),(-.032,.95),(-.072,.995)],-.156)
    parts.face('char_torso','shirt',[(-.105,1.10),(-.012,1.066),(-.030,1.022),(-.085,1.035)],-.162)
    parts.face('char_torso','shirt',[(.105,1.10),(.012,1.066),(.030,1.022),(.085,1.035)],-.162)
    box('char_torso','tie',(0,-.177,1.044),(.026,.018,.026))
    parts.face('char_torso','tie',[(-.012,1.05),(-.073,1.063),(-.052,1.016),(-.010,1.036)],-.182)
    parts.face('char_torso','tie',[(.012,1.05),(.073,1.063),(.052,1.016),(.010,1.036)],-.182)
    # Discrete black lapel planes; geometry, no painted light/shadow texture.
    parts.face('char_torso','clothing',[(-.125,1.09),(-.080,1.004),(-.093,.98),(-.150,1.04)],-.164)
    parts.face('char_torso','clothing',[(.125,1.09),(.080,1.004),(.093,.98),(.150,1.04)],-.164)
    # Square head and nose, with small ears. All geometry remains local to rig.
    box('char_head','skin',(0,0,1.14),(.15,.16,.12))
    tapered(parts,'char_head','skin',[(1.17,.225),(1.34,.27),(1.72,.27)],-.30,.27)
    for x in [-.286,.286]:box('char_head','skin',(x,0,1.40),(.036,.12,.12))
    box('char_head','skin',(0,-.318,1.365),(.064,.036,.054))
    for side,x in [('negx',-.375),('posx',.375)]:
        shifted_sleeve(parts,x)
        box('char_arm_'+side,'shirt',(x,-.002,.613),(.112,.234,.035))
        box('char_hand_'+side,'skin',(x,-.003,.552),(.108,.232,.087))
        lx=-.125 if side=='negx' else .125
        leg='char_leg_'+side
        box(leg,'skin',(lx,0,.28),(.15,.17,.30))
        # Same five-block heel construction as the Atrium NPCs, now with the
        # independent shoes material rather than the facial dark material.
        box(leg,'shoes',(lx,.054,.042),(.095,.078,.084))
        box(leg,'shoes',(lx,-.109,.024),(.172,.145,.048))
        box(leg,'shoes',(lx,-.073,.058),(.172,.19,.045))
        box(leg,'shoes',(lx,-.009,.087),(.166,.125,.045))
        box(leg,'shoes',(lx,.032,.115),(.16,.080,.043))
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
    # Fixed head accessory: outside char_hair, visible for every hairstyle/bald.
    x=.17;z=1.68
    bow_loop(parts,[(x-.010,z),(x-.100,z+.055),(x-.115,z+.030),(x-.115,z-.030),(x-.100,z-.055)])
    bow_loop(parts,[(x+.010,z),(x+.100,z+.055),(x+.115,z+.030),(x+.115,z-.030),(x+.100,z-.055)])
    box('char_bow','bow',(x,-.369,z),(.037,.034,.046))
    bow_loop(parts,[(x-.012,z-.012),(x-.055,z-.088),(x-.020,z-.073),(x,z-.090),(x+.010,z-.018)])
    box('char_bow','bow',(x,-.326,z),(.018,.058,.018))
    parts.finish()
    root=bpy.data.objects['char_root']
    root['asset_id']='female_base'
    root['contract']='AOP_CHAR_RIGID_1'
    root['design_revision']='female_modular_v03_long_fixed_bow'
    root['intended_instance_scale']=1.0

