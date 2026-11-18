"""Concept 05 styling on the existing rigid user bodies, in metres."""
import bpy
from mathutils import Matrix
PALETTE={'skin':(.020,.025,.033),'hair':(.38,.245,.115),'eyebrows':(.008,.72,.78),
 'iris':(.008,.72,.78),'clothing':(.075,.016,.047),'shirt':(.78,.82,.84),
 'tie':(.008,.72,.78),'pants':(.055,.012,.036),'shoes':(.006,.009,.014),
 'accent':(.008,.72,.78),'bow':(.008,.72,.78),'dark':(.003,.005,.008),'white':(.95,.97,1),
 'mouth':(.008,.72,.78),'status':(.008,.72,.78)}

def jacket_front(p,female=False):
    c='char_torso';bottom=.712 if female else .658
    p.face(c,'shirt',[(-.113,1.110),(.113,1.110),(.068,1.007),(0,.950),(-.068,1.007)],-.156)
    for sign in [-1,1]:
        p.face(c,'shirt',[(sign*.109,1.112),(sign*.008,1.075),(sign*.044,1.019),(sign*.098,1.068)],-.163)
    # Offset wrap panels, two simple square closures and a cyan collar edge.
    p.face(c,'clothing',[(-.215,1.080),(-.100,1.103),(.020,1.000),(.205,1.082),(.202,bottom+.034),(.027,bottom),(-.205,bottom+.043)],-.173)
    p.face(c,'clothing',[(-.105,1.105),(-.222,1.071),(-.192,1.026),(-.208,1.012),(-.065,.907),(.026,1.000)],-.180)
    p.face(c,'clothing',[(.113,1.108),(.207,1.075),(.197,1.032),(.037,.967),(-.068,.917),(.023,1.013)],-.183)
    p.face(c,'accent',[(-.107,1.108),(.022,1.010),(.197,1.080),(.198,1.071),(.023,1.000),(-.109,1.099)],-.185)
    p.box(c,'tie',(.010,-.191,.904 if female else .855),(.024,.016,.024))
    p.box(c,'clothing',(.010,-.187,.821 if female else .762),(.027,.020,.027))

def temple_marks(p):
    # Kept as a source-compatible hook. Digital identity is expressed by the
    # face itself; the accent material is used only on the jacket trim.
    pass

def digital_face(p):
    shape=[(-.076,0),(-.052,.026),(-.02,.035),(.018,.034),(.052,.023),(.076,0),(.047,-.021),(.012,-.028),(-.026,-.026),(-.054,-.016)]
    brow=[(-.067,-.003),(-.034,.010),(.005,.014),(.042,.008),(.065,-.002),(.037,.001),(.002,.005),(-.033,.001)]
    for side,x in [('negx',-.12),('posx',.12)]:
        eye='char_eye_'+side;pupil='char_pupil_'+side
        parent=bpy.data.objects[eye];control=bpy.data.objects.new(pupil,None);bpy.context.collection.objects.link(control)
        control.parent=parent;control.matrix_parent_inverse=Matrix.Identity(4);control.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        p.face(eye,'iris',[(x+dx,1.414+dz) for dx,dz in shape],-.303)
        p.face(eye,'dark',[(x+dx*.86,1.414+dz*.68) for dx,dz in shape],-.305)
        p.ellipse(pupil,'iris',x,1.414,.025,.025,-.307)
        p.ellipse(pupil,'dark',x,1.414,.011,.017,-.309)
        p.ellipse(pupil,'white',x-.008,1.425,.006,.006,-.311,12)
        p.face('char_eyebrows','eyebrows',[(x+dx,1.482+dz*2) for dx,dz in brow],-.304)
    smile=[(-.080,1.301),(-.043,1.289),(0,1.286),(.043,1.289),(.080,1.301),(.060,1.271),(.030,1.252),(0,1.247),(-.030,1.252),(-.060,1.271)]
    p.face('char_mouth','mouth',smile,-.303)
    p.face('char_mouth','dark',[(x*.80,1.276+(z-1.276)*.54) for x,z in smile],-.305)
    p.face('char_mouth','white',[(-.047,1.289),(-.022,1.281),(0,1.279),(.022,1.281),(.047,1.289),(.033,1.279),(0,1.273),(-.033,1.279)],-.307)
    status=bpy.data.objects.new('char_status',None);bpy.context.collection.objects.link(status)
    status.parent=bpy.data.objects['char_torso'];status.location=(.155,-.197,.310)
    bpy.context.view_layer.update()
    p.box('char_status','status',(.155,-.197,1.030),(.037,.013,.016))

def long_hair(p):
    box=lambda c,s:p.box('char_hair','hair',c,s)
    box((0,-.012,1.738),(.586,.606,.055));box((0,.281,1.586),(.586,.045,.25))
    for x in [-.282,.282]:box((x,-.005,1.615),(.064,.58,.245))
    for x,width,bottom in [(-.245,.096,1.50),(-.147,.10,1.53),(-.049,.10,1.59),(.049,.10,1.63),(.147,.10,1.59),(.245,.096,1.54)]:
        box((x,-.311,(bottom+1.72)/2),(width,.034,1.72-bottom))
    box((0,.315,1.50),(.46,.070,.12));box((0,.35,1.35),(.46,.050,.30));box((0,.35,1.145),(.36,.050,.13))
    for x in [-.255,.255]:box((x,.04,1.385),(.040,.20,.27))
    box((0,.40,1.005),(.30,.060,.17))
