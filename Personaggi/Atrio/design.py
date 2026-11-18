"""Two original voxel office NPCs, Concept 02 ceramic visual treatment.

Geometry is rigid and in metres, Blender Z-up, -Y front. The ceramic look is
purely visual: both figures remain human-profile decorative NPC assets.
"""
from support import *

def tapered(p,control,role,rings,front=-.15,back=.15):
    v,f,r=p.groups.setdefault(control,([],[],[]));i=len(v)
    for z,w in rings:v.extend([(-w,front,z),(w,front,z),(w,back,z),(-w,back,z)])
    f.append((i,i+3,i+2,i+1));r.append(role)
    for ring in range(len(rings)-1):
        for side in range(4):
            a=i+ring*4+side;b=i+ring*4+(side+1)%4
            f.append((a,b,b+4,a+4));r.append(role)
    j=i+(len(rings)-1)*4;f.append((j,j+1,j+2,j+3));r.append(role)

def sleeve(p,side,x):
    c='char_arm_'+side;v,f,r=p.groups.setdefault(c,([],[],[]));i=len(v)
    for z,w in [(.628,.05),(.875,.06),(1.077,.065)]:
        v.extend([(x-w,-.115,z),(x+w,-.115,z),(x+w,.115,z),(x-w,.115,z)])
    f.append((i,i+3,i+2,i+1));r.append('clothing')
    for ring in range(2):
        for side in range(4):
            a=i+ring*4+side;b=i+ring*4+(side+1)%4
            f.append((a,b,b+4,a+4));r.append('clothing')
    f.append((i+8,i+9,i+10,i+11));r.append('clothing')

def hair(p,blonde):
    """Two distinct styles, each in one replaceable char_hair mesh."""
    box=lambda c,s:p.box('char_hair','hair',c,s)
    box((0,-.012,1.738),(.586,.606,.055))
    box((0,.281,1.488),(.586,.045,.45))
    for x in [-.282,.282]:box((x,-.005,1.665),(.064,.58,.13))
    for x,width,bottom in [(-.245,.096,1.53),(-.147,.10,1.57),(-.049,.10,1.61),(.049,.10,1.65),(.147,.10,1.62),(.245,.096,1.57)]:
        box((x,-.311,(bottom+1.72)/2),(width,.034,1.72-bottom))
    if blonde:
        # Long rear curtain and side lengths. Front lengths sit in front of
        # the white jacket, with a small real gap rather than penetrating it.
        box((0,.328,1.205),(.50,.070,.37))
        for x in [-.280,.280]:
            box((x,.04,1.405),(.045,.36,.46))
            box((x,-.222,1.20),(.060,.065,.28))
            box((x,-.218,1.035),(.049,.060,.05))
    else:
        for x in [-.282,.282]:box((x,-.005,1.415),(.064,.58,.50))
        box((0,.293,1.195),(.62,.067,.09))

def jacket(p):
    # Compact standing collar, dark inner blouse and stepped cobalt piping.
    p.box('char_torso','shirt',(0,0,1.11),(.166,.18,.060))
    p.face('char_torso','shirt',[(-.085,1.102),(.085,1.102),(.085,1.055),(.053,1.055),(.053,1.012),(.026,.989),(.026,.710),(-.026,.710),(-.026,.989),(-.053,1.012),(-.053,1.055),(-.085,1.055)],-.155)
    for sign in [-1,1]:
        p.face('char_torso','accent',[(sign*.085,1.102),(sign*.103,1.102),(sign*.103,1.040),(sign*.070,1.040),(sign*.070,1.003),(sign*.043,.979),(sign*.043,.710),(sign*.026,.710),(sign*.026,.989),(sign*.053,1.012),(sign*.053,1.055),(sign*.085,1.055)],-.160)
        p.box('char_torso','clothing',(sign*.136,-.157,.778),(.085,.014,.018))
    # Tiny collar clasp retains the independent tie color role.
    p.box('char_torso','tie',(0,-.168,1.078),(.031,.018,.025))

def head_accessory(p,blonde):
    if blonde:
        p.parents['char_bow']='char_head'
        def loop(outline):
            v,f,r=p.groups.setdefault('char_bow',([],[],[]));i=len(v);n=len(outline)
            for y in [-.381,-.354]:v.extend((x,y,z) for x,z in outline)
            order=list(range(n))
            if sum(outline[k][0]*outline[(k+1)%n][1]-outline[(k+1)%n][0]*outline[k][1] for k in range(n))<0:order.reverse()
            f.append(tuple(i+k for k in order));r.append('bow')
            f.append(tuple(i+n+k for k in reversed(order)));r.append('bow')
            for a,b in zip(order,order[1:]+order[:1]):f.append((i+a,i+b,i+n+b,i+n+a));r.append('bow')
        x=.17;z=1.68
        loop([(x-.010,z),(x-.100,z+.055),(x-.115,z+.030),(x-.115,z-.030),(x-.100,z-.055)])
        loop([(x+.010,z),(x+.100,z+.055),(x+.115,z+.030),(x+.115,z-.030),(x+.100,z-.055)])
        p.box('char_bow','bow',(x,-.369,z),(.037,.034,.046))
        loop([(x-.012,z-.012),(x-.055,z-.088),(x-.020,z-.073),(x,z-.090),(x+.010,z-.018)])
        p.box('char_bow','bow',(x,-.326,z),(.018,.058,.018))
    else:
        p.parents['char_headband']='char_head'
        p.box('char_headband','headband',(0,-.080,1.772),(.642,.038,.016))
        for x in [-.320,.320]:p.box('char_headband','headband',(x,-.080,1.670),(.015,.038,.200))

def build_character(asset):
    if asset not in ['reception_a','reception_b']:raise ValueError(asset)
    empty_scene();bpy.ops.import_scene.gltf(filepath=str(RES/'starter_human.glb'))
    for o in list(bpy.data.objects):
        if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m)
    bpy.context.view_layer.update();blonde=asset=='reception_a'
    colors={'skin':(.88,.64,.44),'clothing':(.88,.85,.76),'hair':(.69,.43,.115) if blonde else (.115,.047,.023),
        'eyebrows':(.24,.15,.045) if blonde else (.060,.024,.012),
        'iris':(.018,.20,.48) if blonde else (.10,.27,.11),
        'shirt':(.018,.024,.033),'tie':(.012,.055,.56),'pants':(.025,.032,.043),
        'shoes':(.006,.009,.014),'accent':(.012,.055,.56),'dark':(.004,.006,.010),'white':(.95,.97,1)}
    colors['bow' if blonde else 'headband']=(.012,.055,.56)
    mats={k:material('char_mat_'+k,v) for k,v in colors.items()}
    p=Parts(mats);p.parents['char_eyebrows']='char_head';box=p.box
    tapered(p,'char_torso','clothing',[(.710,.20),(.80,.18),(.97,.21),(1.095,.215)])
    box('char_torso','clothing',(0,0,1.06),(.63,.30,.07))
    box('char_torso','clothing',(0,0,.70),(.385,.295,.04))
    tapered(p,'char_torso','pants',[(.425,.265),(.56,.25),(.690,.195)],-.17,.17)
    jacket(p)
    box('char_head','skin',(0,0,1.14),(.15,.16,.12))
    tapered(p,'char_head','skin',[(1.17,.225),(1.34,.27),(1.72,.27)],-.30,.27)
    for x in [-.286,.286]:box('char_head','skin',(x,0,1.40),(.036,.12,.12))
    box('char_head','skin',(0,-.318,1.365),(.064,.036,.054))
    for side,x in [('negx',-.375),('posx',.375)]:
        sleeve(p,side,x)
        box('char_arm_'+side,'shirt',(x,-.002,.613),(.112,.234,.035))
        box('char_hand_'+side,'skin',(x,-.003,.552),(.108,.232,.087))
        lx=-.125 if side=='negx' else .125;c='char_leg_'+side
        box(c,'skin',(lx,0,.28),(.15,.17,.30))
        for center,size in [((lx,.054,.042),(.095,.078,.084)),((lx,-.109,.024),(.172,.145,.048)),
            ((lx,-.073,.058),(.172,.19,.045)),((lx,-.009,.087),(.166,.125,.045)),((lx,.032,.115),(.16,.080,.043))]:box(c,'shoes',center,size)
    eye_shape=[(-.076,0),(-.052,.026),(-.02,.035),(.018,.034),(.052,.023),(.076,0),(.047,-.021),(.012,-.028),(-.026,-.026),(-.054,-.016)]
    brow=[(-.067,-.003),(-.034,.010),(.005,.014),(.042,.008),(.065,-.002),(.037,.001),(.002,.005),(-.033,.001)]
    for side,x in [('negx',-.12),('posx',.12)]:
        c='char_eye_'+side
        p.face(c,'dark',[(x+dx,1.414+dz) for dx,dz in eye_shape],-.303)
        p.face(c,'white',[(x+dx*.92,1.414+dz*.78-.001) for dx,dz in eye_shape],-.305)
        p.ellipse(c,'iris',x,1.414,.025,.025,-.307);p.ellipse(c,'dark',x,1.414,.011,.017,-.309)
        p.ellipse(c,'white',x-.008,1.425,.006,.006,-.311,12)
        p.face('char_eyebrows','eyebrows',[(x+dx,1.482+dz*1.8) for dx,dz in brow],-.304)
    p.face('char_mouth','dark',[(-.080,1.301),(-.043,1.289),(0,1.286),(.043,1.289),(.080,1.301),(.060,1.271),(.030,1.252),(0,1.247),(-.030,1.252),(-.060,1.271)],-.303)
    p.face('char_mouth','white',[(-.061,1.291),(-.03,1.283),(0,1.281),(.03,1.283),(.061,1.291),(.046,1.277),(0,1.269),(-.046,1.277)],-.305)
    # Fine facial graphic seam; dark is the fixed facial-detail material,
    # separate from all nine user color channels and from the shoe material.
    line=[(.247,1.505),(.247,1.438),(.236,1.420),(.236,1.300),(.215,1.240)]
    p.face('char_head','dark',line+[(x+.0018,z) for x,z in reversed(line)],-.3015)
    hair(p,blonde);head_accessory(p,blonde);p.finish()
    root=bpy.data.objects['char_root'];root['asset_id']=asset;root['contract']='AOP_CHAR_RIGID_1'
    root['design_revision']='reception_concept02_v01';root['profile']='human'
    root['status']='ARTISTIC_APPROVED';root['npc_role']='decorative_reception_npc'
    root['standing_fixed']=True;root['behavior']='none';root['intended_instance_scale']=1.15
    bpy.context.view_layer.update()
