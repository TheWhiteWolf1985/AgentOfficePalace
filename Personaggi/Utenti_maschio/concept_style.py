"""Concept 01 geometry, solid color channels and common modular long hair.

All design coordinates are metres, Blender Z-up and -Y forward.
Details are collected per existing rigid control; no extra transform controls.
"""
PALETTE = {
    'skin': (.80,.52,.32), 'clothing': (.018,.032,.075),
    'hair': (.38,.245,.115), 'shirt': (.90,.88,.82),
    'tie': (.008,.23,.25), 'dark': (.004,.006,.01),
    'white': (.95,.97,1), 'iris': (.018,.24,.48),
    'eyebrows': (.25,.145,.060), 'pants': (.018,.032,.075),
    'shoes': (.006,.009,.014), 'bow': (.008,.23,.25),
    'accent': (.008,.23,.25),
}

def facet(parts, control, role, outline, front=-.173, back=-.152):
    """Small solid tailored applique with shallow bevel, no painted shading."""
    vertices, faces, roles = parts.groups.setdefault(control,([],[],[]))
    n=len(outline);start=len(vertices)
    cx=sum(x for x,z in outline)/n;cz=sum(z for x,z in outline)/n
    for y,shrink in [(back,1),(front,.94)]:
        vertices.extend((cx+(x-cx)*shrink,y,cz+(z-cz)*shrink) for x,z in outline)
    order=list(range(n))
    area=sum(outline[i][0]*outline[(i+1)%n][1]-outline[(i+1)%n][0]*outline[i][1] for i in range(n))
    if area<0:order.reverse()
    faces.append(tuple(start+n+i for i in order));roles.append(role)
    faces.append(tuple(start+i for i in reversed(order)));roles.append(role)
    for a,b in zip(order,order[1:]+order[:1]):
        faces.append((start+a,start+b,start+n+b,start+n+a));roles.append(role)

def jacket_front(parts, female=False):
    c='char_torso';face=parts.face;box=parts.box
    if female:
        face(c,'shirt',[(-.096,1.101),(.096,1.101),(.063,.986),(0,.927),(-.063,.986)],-.156)
        for sign in [-1,1]:
            facet(parts,c,'shirt',[(sign*.104,1.103),(sign*.009,1.074),(sign*.044,1.018),(sign*.094,1.048)],-.177,-.153)
            lapel=[(.104,1.096),(.202,1.078),(.176,1.044),(.195,1.024),(.048,.870),(.061,.974)]
            facet(parts,c,'clothing',[(sign*x,z) for x,z in lapel],-.181,-.151)
            facet(parts,c,'clothing',[(sign*.088,.785),(sign*.168,.796),(sign*.171,.775),(sign*.092,.764)],-.173,-.150)
        box(c,'tie',(0,-.196,1.050),(.029,.025,.030))
        for sign in [-1,1]:
            facet(parts,c,'tie',[(sign*.012,1.056),(sign*.071,1.075),(sign*.066,1.031),(sign*.013,1.038)],-.199,-.181)
            facet(parts,c,'tie',[(sign*.010,1.043),(sign*.029,1.035),(sign*.040,.960),(sign*.014,.977)],-.186,-.160)
        box(c,'clothing',(0,-.170,.834),(.023,.028,.023))
    else:
        face(c,'shirt',[(-.113,1.113),(.113,1.113),(.077,.991),(0,.855),(-.077,.991)],-.156)
        for sign in [-1,1]:
            facet(parts,c,'shirt',[(sign*.112,1.114),(sign*.008,1.080),(sign*.052,1.017),(sign*.104,1.067)],-.177,-.153)
            lapel=[(.113,1.112),(.221,1.086),(.188,1.049),(.210,1.024),(.053,.834),(.066,.965)]
            facet(parts,c,'clothing',[(sign*x,z) for x,z in lapel],-.181,-.151)
            facet(parts,c,'clothing',[(sign*.086,.746),(sign*.205,.746),(sign*.205,.720),(sign*.086,.720)],-.175,-.150)
        box(c,'tie',(0,-.194,1.068),(.047,.024,.045))
        facet(parts,c,'tie',[(-.018,1.048),(.018,1.048),(.030,.891),(0,.853),(-.030,.891)],-.192,-.168)
        box(c,'clothing',(0,-.171,.793),(.024,.030,.024))

def temple_marks(parts):
    parts.parents['char_accent']='char_head'
    for z in [1.431,1.455]:
        facet(parts,'char_accent','accent',[(.211,z),(.254,z+.014),(.254,z+.028),(.211,z+.014)],-.309,-.301)

def long_hair(parts):
    """Current shared short cap plus the proven v03 rear extension."""
    box=lambda c,s:parts.box('char_hair','hair',c,s)
    box((0,-.012,1.738),(.586,.606,.055))
    box((0,.281,1.586),(.586,.045,.25))
    for x in [-.282,.282]:box((x,-.005,1.615),(.064,.58,.245))
    for x,width,bottom in [(-.245,.096,1.50),(-.147,.10,1.53),(-.049,.10,1.59),(.049,.10,1.63),(.147,.10,1.59),(.245,.096,1.54)]:
        box((x,-.311,(bottom+1.72)/2),(width,.034,1.72-bottom))
    box((0,.315,1.50),(.46,.070,.12));box((0,.35,1.35),(.46,.050,.30))
    box((0,.35,1.145),(.36,.050,.13))
    for x in [-.255,.255]:box((x,.04,1.385),(.040,.20,.27))
    box((0,.40,1.005),(.30,.060,.17))
