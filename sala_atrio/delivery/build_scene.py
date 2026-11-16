"""Atrio Agent Office Palace, bozza v03 di Juri, 16 novembre 2026.

Blender --background --python work/build_scene.py -- --output-dir work/v03
Non cancella scene preesistenti e rifiuta di sovrascrivere la destinazione.
Nessuna risorsa esterna; palette ripresa dal modello della sala riunioni.
"""
from pathlib import Path
import argparse
import json
import math
import sys
import bpy
import bmesh
from mathutils import Vector

SCENE = 'AOP_Sala_Atrio_v03'
HEIGHT = 5.2


def enum(owner, prop, value):
    options = [v.identifier for v in owner.bl_rna.properties[prop].enum_items]
    try:
        setattr(owner, prop, value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f'{prop}: {value}; disponibili: {options}') from exc


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def build(output):
    output = Path(output).resolve()
    if (output / 'atrium.blend').exists() or SCENE in bpy.data.scenes:
        raise RuntimeError('File/scena già presente: usare una destinazione nuova.')
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    enum(scene.unit_settings, 'system', 'METRIC')
    scene.unit_settings.scale_length = 1
    enum(scene.unit_settings, 'length_unit', 'METERS')
    asset = bpy.data.collections.new('ATRIO_Asset')
    preview = bpy.data.collections.new('ATRIO_Anteprima_NON_ESPORTARE')
    guides = bpy.data.collections.new('ATRIO_Guide_NON_ESPORTARE')
    for c in (asset, preview, guides):
        scene.collection.children.link(c)
    guides.hide_render = True
    palette = {
        'cream': (.94,.85,.68), 'sand': (.86,.69,.49),
        'wood_light': (.94,.73,.44), 'wood_warm': (.89,.66,.38),
        'wood_honey': (.87,.62,.34), 'wood_edge': (.67,.43,.24),
        'slate': (.40,.47,.46), 'ink': (.17,.23,.25),
        'teal': (.23,.62,.63), 'orange': (.94,.40,.20),
        'gold': (1,.69,.17), 'ceiling': (.91,.86,.73),
        'glow': (1,.91,.64), 'glass': (.47,.66,.70),
        'rug': (.24,.34,.34), 'leaf': (.29,.58,.25),
        'leaf_light': (.46,.70,.32), 'terracotta': (.75,.29,.14),
        'soil': (.25,.18,.12), 'screen': (.19,.36,.42),
    }
    mats = {}
    for name, rgb in palette.items():
        m = bpy.data.materials.new('atrio_mat_' + name)
        m.use_nodes = True
        m.diffuse_color = (*rgb,1)
        sh = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        sh.inputs['Base Color'].default_value = (*map(linear,rgb),1)
        sh.inputs['Roughness'].default_value = .74
        if name == 'glow':
            sh.inputs['Emission Color'].default_value = (*map(linear,rgb),1)
            sh.inputs['Emission Strength'].default_value = 2.5
        if name == 'glass':
            sh.inputs['Alpha'].default_value = .22
            sh.inputs['Roughness'].default_value = .18
            if hasattr(m,'surface_render_method'):
                enum(m,'surface_render_method','DITHERED')
            m.diffuse_color = (*rgb,.22)
        mats[name] = m

    def empty(name, parent=None, col=asset):
        o = bpy.data.objects.new('atrio_' + name,None)
        col.objects.link(o)
        o.parent = parent
        enum(o,'empty_display_type','PLAIN_AXES')
        o.empty_display_size = .25
        return o
    root = empty('root')
    root['design_stage'] = 'v03_review_with_Juri'
    arch = empty('architecture',root)
    furniture = empty('furniture',root)
    stairs = empty('stairs',arch)
    ceiling = empty('ceiling',arch)
    anchors = empty('anchors',root)
    colliders = []

    def mesh(name, verts, faces, mat, parent=arch, bevel=0, col=asset):
        me = bpy.data.meshes.new('atrio_' + name + '_mesh')
        me.from_pydata(verts,[],faces)
        me.update()
        me.materials.append(mats[mat])
        o = bpy.data.objects.new('atrio_' + name,me)
        col.objects.link(o)
        o.parent = parent
        if bevel:
            kinds = [i.identifier for i in bpy.types.Modifier.bl_rna.properties['type'].enum_items]
            if 'BEVEL' not in kinds:
                raise RuntimeError('Modificatore BEVEL non disponibile')
            mod = o.modifiers.new('Bordi_semplici','BEVEL')
            mod.width = bevel
            mod.segments = 2
        return o

    def box(name, lo, hi, mat, parent=arch, bevel=0, collider=False):
        v=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        f=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]
        o=mesh(name,v,f,mat,parent,bevel)
        if collider:
            colliders.append({'node':o.name,'min_blender_m':list(lo),'max_blender_m':list(hi)})
        return o

    def beam(name, a, b, width, depth, mat, parent=stairs):
        d=Vector(b)-Vector(a)
        o=box(name,(-width/2,-depth/2,-d.length/2),(width/2,depth/2,d.length/2),mat,parent,.015)
        o.location=(Vector(a)+Vector(b))/2
        o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
        return o

    def ellipse(name, center, radius, z0, z1, mat, parent=arch, n=64):
        cx,cy=center;rx,ry=radius
        v=[(cx+rx*math.cos(i*math.tau/n),cy+ry*math.sin(i*math.tau/n),z)
           for z in (z0,z1) for i in range(n)]
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return mesh(name,v,f,mat,parent,.015)

    def arc_band(name, a, b, inner_a, inner_b, cy, z0, z1, mat, parent=furniture):
        n=48;v=[]
        for z in (z0,z1):
            for aa,bb in ((a,b),(inner_a,inner_b)):
                v.extend((aa*math.cos(math.pi*i/n),cy-bb*math.sin(math.pi*i/n),z) for i in range(n+1))
        k=n+1;f=[]
        for i in range(n):
            f.extend([(i,i+1,2*k+i+1,2*k+i),
                      (k+i,3*k+i,3*k+i+1,k+i+1),
                      (2*k+i,2*k+i+1,3*k+i+1,3*k+i),
                      (i,k+i,k+i+1,i+1)])
        f.extend([(0,2*k,3*k,k),(n,k+n,3*k+n,2*k+n)])
        ob=mesh(name,v,f,mat,parent,.025)
        bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        bm.to_mesh(ob.data);bm.free();ob.data.update()
        return ob

    def text(name, body, loc, size, mat='ink', parent=arch, rotation=(math.pi/2,0,0)):
        cu=bpy.data.curves.new('atrio_'+name+'_font','FONT')
        cu.body=body
        enum(cu,'align_x','CENTER')
        cu.size=size;cu.extrude=.003;cu.space_character=1.15
        ob=bpy.data.objects.new('atrio_'+name,cu)
        asset.objects.link(ob);ob.parent=parent;ob.location=loc;ob.rotation_euler=rotation
        cu.materials.append(mats[mat])
        bpy.context.view_layer.update()
        me=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        name_ob=ob.name;matrix=ob.matrix_basis.copy()
        bpy.data.objects.remove(ob,do_unlink=True)
        o=bpy.data.objects.new(name_ob,me);asset.objects.link(o);o.parent=parent;o.matrix_basis=matrix
        return o

    # Pavimento in listoni: stesso linguaggio visivo della sala riunioni.
    # Vano ascensore conservato libero alla posizione del piano di riferimento.
    zones=[('main',-18,18,-13,10.6),('rear_left',-18,7.2,10.6,13),('rear_right',9.8,18,10.6,13)]
    for name,x0,x1,y0,y1 in zones:
        box('floor_'+name,(x0,y0,-.22),(x1,y1,-.022),'wood_edge',collider=True)
        verts=[];faces=[];ids=[]
        x=x0;stripe=0
        while x<x1-.001:
            xx=min(x+.9,x1);y=y0;piece=0
            while y<y1-.001:
                yy=min(y+(2.3 if stripe%2 and piece==0 else 4.6),y1)
                start=len(verts)
                verts.extend([(x+.008,y+.008,0),(xx-.008,y+.008,0),(xx-.008,yy-.008,0),(x+.008,yy-.008,0)])
                faces.append(tuple(start+i for i in range(4)));ids.append((stripe+piece)%3)
                y=yy;piece+=1
            x=xx;stripe+=1
        o=mesh('floor_boards_'+name,verts,faces,'wood_light')
        o.data.materials.append(mats['wood_warm']);o.data.materials.append(mats['wood_honey'])
        for p,mid in zip(o.data.polygons,ids):p.material_index=mid
    box('wall_north_west',(-18.3,13,0),(7.2,13.3,HEIGHT),'sand',collider=True)
    box('wall_north_east',(9.8,13,0),(18.3,13.3,HEIGHT),'sand',collider=True)
    # Finestre sui lati corti, con fasce murarie e cornici color ardesia.
    for side,xa,xb in [('west',-18.3,-18),('east',18,18.3)]:
        box('wall_'+side+'_base',(xa,-13,0),(xb,13,1.05),'cream')
        box('wall_'+side+'_header',(xa,-13,4.55),(xb,13,HEIGHT),'cream')
        inside=-17.98 if side=='west' else 17.98
        for i in range(8):
            ya=-13+i*3.25;yb=ya+3.25
            box(f'window_{side}_{i}_glass',(inside-.015,ya+.12,1.10),(inside+.015,yb-.12,4.5),'glass')
            box(f'window_{side}_{i}_pier',(xa,ya,1.05),(xb,ya+.20,4.55),'sand')
            box(f'window_{side}_{i}_sill',(max(xa-.08,-18.3),ya,1.0),(min(xb+.08,18.3),yb,1.12),'wood_light')
            box(f'window_{side}_{i}_top',(inside-.04,ya,4.45),(inside+.04,yb,4.55),'slate')
            box(f'window_{side}_{i}_mullion',(inside-.035,(ya+yb)/2-.035,1.10),(inside+.035,(ya+yb)/2+.035,4.5),'slate')
    # Parete ingresso: apertura centrale 4.8 m, due ali finestrate.
    for tag,x0,x1 in [('left',-18,-2.4),('right',2.4,18)]:
        box('wall_south_'+tag+'_base',(x0,-13.3,0),(x1,-13,.95),'cream')
        box('wall_south_'+tag+'_glass',(x0,-13.1,.95),(x1,-13.06,4.55),'glass')
        for i in range(6):
            x=x0+(x1-x0)*i/5
            box(f'window_south_{tag}_{i}',(x-.06,-13.16,.95),(x+.06,-12.98,4.55),'slate')
    box('wall_south_header',(-18.3,-13.3,4.55),(18.3,-13,HEIGHT),'cream')
    for x in [-2.4,2.4]:
        box('entrance_post_'+str(x),(x-.08,-13.18,0),(x+.08,-12.95,4.55),'slate')
    # Soffitto con intagli reali per scala e ascensore.
    ceiling_zones=[(-18,18,-13,2.9),(-18,-16.1,2.9,12),(-9.9,18,2.9,10.6),
                   (-9.9,7.2,10.6,12),(9.8,18,10.6,13),(-18,7.2,12,13)]
    for i,(x0,x1,y0,y1) in enumerate(ceiling_zones):
        ob=box(f'ceiling_slab_{i}',(x0,y0,HEIGHT),(x1,y1,HEIGHT+.20),'ceiling',ceiling)
        ob.hide_set(True)  # Cutaway solo nel viewport; resta nel render e nell'export.
    # Pannelli alternati dietro il bancone.
    for i in range(10):
        x=-7.1+i*1.42
        box(f'reception_wall_panel_{i}',(x+.035,12.83,.2),(x+1.385,12.98,5.0),
            'wood_warm' if i%2==0 else 'cream',bevel=.018)
    box('brand_panel',(-3.9,12.65,2.55),(3.9,12.80,4.45),'cream',bevel=.08)
    text('brand','AGENT OFFICE',(0,12.59,3.65),.66,'ink')
    text('brand_palace','P A L A C E',(0,12.59,3.10),.30,'teal')

    # Bancone curvo centrato X=0 sulla parete lunga nord, come richiesto.
    arc_band('reception_body',5.6,2.6,5.10,1.92,10.0,.08,1.18,'wood_warm')
    arc_band('reception_plinth',5.61,2.61,5.08,1.90,10.0,.035,.16,'ink')
    arc_band('reception_top',5.73,2.72,5.00,1.81,10.0,1.18,1.31,'wood_light')
    arc_band('reception_teal_band',5.625,2.625,5.59,2.59,10.0,.77,.91,'teal')
    arc_band('reception_wood_band',5.65,2.65,5.59,2.59,10.0,.52,.60,'wood_light')
    box('reception_worktop',(-4.4,9.25,.77),(4.4,10.15,.86),'wood_light',furniture,.035)
    for i,x in enumerate([-3.8,0,3.8]):
        box(f'reception_worktop_leg_{i}',(x-.065,9.4,.02),(x+.065,10.0,.77),'slate',furniture)
    # Due postazioni reception, schermi rivolti verso chi lavora dietro il banco.
    for i,x in enumerate([-2.15,2.15]):
        box(f'pc_{i}_base',(x-.28,9.52,.86),(x+.28,9.89,.9),'slate',furniture,.02)
        box(f'pc_{i}_stand',(x-.05,9.65,.90),(x+.05,9.74,1.13),'slate',furniture)
        box(f'pc_{i}_body',(x-.46,9.64,1.05),(x+.46,9.73,1.59),'ink',furniture,.025)
        box(f'pc_{i}_screen',(x-.41,9.735,1.10),(x+.41,9.743,1.54),'screen',furniture)
        box(f'pc_{i}_keyboard',(x-.3,9.83,.86),(x+.3,10.08,.89),'slate',furniture,.01)
        box(f'staff_chair_{i}_seat',(x-.34,10.47,.43),(x+.34,11.11,.55),'teal',furniture,.06)
        box(f'staff_chair_{i}_back',(x-.34,11.04,.55),(x+.34,11.20,1.23),'teal',furniture,.06)
        box(f'staff_chair_{i}_stem',(x-.05,10.74,.10),(x+.05,10.84,.43),'slate',furniture)
        box(f'staff_chair_{i}_foot',(x-.35,10.52,.06),(x+.35,11.08,.12),'slate',furniture,.02)
        e=empty('staff_position_'+str(i+1),anchors);e.location=(x,10.8,.5)
        e['role']='reception_staff';e['forward_axis']='-Y'
    ellipse('reception_rug',(0,4.9),(6.5,3.3),.003,.019,'rug',furniture)

    # Scala a U a sinistra: 30 alzate, due rampe e pianerottolo intermedio.
    rise=HEIGHT/30;run=.32;start=4.3
    for flight in range(2):
        xa,xb=(-15.7,-13.1) if flight==0 else (-12.9,-10.3)
        for i in range(15):
            y0=start+i*run if flight==0 else 9.1-(i+1)*run
            y1=y0+run
            z=(i+1)*rise if flight==0 else (16+i)*rise
            box(f'stair_flight_{flight+1}_tread_{i+1:02}',(xa,y0,z-.10),(xb,y1+.015,z),
                'wood_light',stairs,.012,True)
            # Frontalino visibile, indipendente dalla pedata.
            yr=y0 if flight==0 else y1
            box(f'stair_flight_{flight+1}_riser_{i+1:02}',(xa,yr-.015,z-rise),(xb,yr+.015,z-.02),'cream',stairs)
        ya,yb=(start,9.1) if flight==0 else (9.1,start)
        za,zb=(rise,HEIGHT/2) if flight==0 else (HEIGHT/2+rise,HEIGHT)
        for edge,x in enumerate((xa-.04,xb+.04)):
            beam(f'stair_stringer_{flight}_{edge}',(x,ya,za-.22),(x,yb,zb-.22),.12,.20,'slate')
            beam(f'stair_handrail_{flight}_{edge}',(x,ya,za+1),(x,yb,zb+1),.095,.095,'wood_edge')
            for k in range(0,16,3):
                frac=k/15;y=ya+(yb-ya)*frac;z=za+(zb-za)*frac
                beam(f'stair_post_{flight}_{edge}_{k}',(x,y,z-.05),(x,y,z+1),.055,.055,'slate')
            beam(f'stair_midrail_{flight}_{edge}',(x,ya,za+.5),(x,yb,zb+.5),.035,.035,'slate')
    box('stair_half_landing',(-15.85,9.1,2.43),(-10.15,11.3,2.6),'wood_light',stairs,.018,True)
    box('stair_upper_landing',(-12.95,2.95,5.03),(-10.25,4.3,5.2),'wood_light',stairs,.018,True)
    for x in [-15.78,-10.22]:
        beam('landing_guard_'+str(x),(x,9.1,3.6),(x,11.2,3.6),.095,.095,'wood_edge')
        for y in [9.2,10.2,11.2]:
            beam('landing_post_'+str(x)+'_'+str(y),(x,y,2.6),(x,y,3.6),.06,.06,'slate')
    beam('landing_rear_guard',(-15.78,11.2,3.6),(-10.22,11.2,3.6),.095,.095,'wood_edge')
    for x in [-14.8,-13.7,-12.6,-11.5]:
        beam('landing_rear_post_'+str(x),(x,11.2,2.6),(x,11.2,3.6),.06,.06,'slate')
    for x in [-15.7,-10.3]:
        box('landing_support_'+str(x),(x-.07,10.8,0),(x+.07,11.05,2.43),'slate',stairs)
    text('stairs_label','SCALE  /  PIANI SUPERIORI',(-12.95,12.78,4.05),.32,'ink')
    # Vano come nella sala riunioni: intaglio completamente aperto,
    # anche sul muro nord. Nessun portale, tamponamento, cabina o porta.
    ref=box('guide_elevator',(7.2,10.6,0),(9.8,13,HEIGHT),'orange',None)
    for c in list(ref.users_collection):c.objects.unlink(ref)
    guides.objects.link(ref);enum(ref,'display_type','WIRE');ref.hide_render=True;ref.hide_set(True)

    # Panca laterale ispirata al riferimento e accenti della sala riunioni.
    for side,x in [('left',-16.7),('right',16.7)]:
        box('bench_'+side+'_base',(x-.7,-5.4,.08),(x+.7,.6,.39),'wood_warm',furniture,.04)
        for i in range(4):
            box(f'bench_{side}_cushion_{i}',(x-.64,-5.32+i*1.48,.39),(x+.64,-3.94+i*1.48,.58),
                'teal' if side=='left' else 'cream',furniture,.07)
        edge=x-.58 if side=='left' else x+.44
        box('bench_'+side+'_back',(edge,-5.4,.58),(edge+.14,.6,1.23),'cream',furniture,.05)

    def plant(name,x,y):
        ellipse(name+'_pot',(x,y),(.48,.48),.02,.74,'terracotta',furniture,12)
        ellipse(name+'_rim',(x,y),(.52,.52),.69,.81,'orange',furniture,12)
        ellipse(name+'_soil',(x,y),(.44,.44),.81,.825,'soil',furniture,12)
        beam(name+'_stem',(x,y,.82),(x,y,2.55),.06,.06,'wood_edge',furniture)
        verts=[];faces=[]
        for i in range(14):
            a=i*2.39996;z=1.0+i*.10;r=.75 if i<10 else .52
            p=Vector((x,y,z));tip=Vector((x+r*math.cos(a),y+r*math.sin(a),z+.52))
            mid=(p+tip)*.5;side=Vector((-.18*math.sin(a),.18*math.cos(a),.08))
            k=len(verts);verts.extend([p,mid+side,tip,mid-side]);faces.extend([(k,k+1,k+2),(k,k+2,k+3)])
        o=mesh(name+'_leaves',verts,faces,'leaf',furniture)
        o.data.materials.append(mats['leaf_light'])
        for p in o.data.polygons:p.material_index=(p.index//2)%2
    for name,x,y in [('plant_reception_left',-6.55,10.6),('plant_reception_right',11.3,10.8),
                     ('plant_window_left',-16.7,-7.0),('plant_window_right',16.7,-7.0)]:
        plant(name,x,y)

    # Controsoffitti ovali e luce indiretta, ripresi dalla fotografia.
    ellipse('oval_halo',(0,.4),(7.5,4.65),4.96,5.015,'glow',ceiling)
    ellipse('oval_ceiling',(0,.4),(7.34,4.49),4.75,4.97,'ceiling',ceiling)
    ellipse('reception_canopy_halo',(0,10),(6.25,3.25),4.74,4.80,'glow',ceiling)
    ellipse('reception_canopy',(0,10),(6.10,3.10),4.52,4.75,'ceiling',ceiling)
    for i in range(10):
        a=i*math.tau/10;x=6.35*math.cos(a);y=.4+3.65*math.sin(a)
        ellipse(f'oval_downlight_{i}',(x,y),(.12,.12),4.724,4.75,'glow',ceiling,16)
    for i in range(7):
        a=math.pi*(i+.5)/7;x=5.45*math.cos(a);y=10-2.55*math.sin(a)
        ellipse(f'reception_downlight_{i}',(x,y),(.11,.11),4.495,4.522,'glow',ceiling,16)
    # Lampade quadrate nelle due zone laterali, come nella sala riunioni.
    for i,(x,y) in enumerate([(-14,-4),(14,-4),(-11,-8),(11,-8)]):
        box(f'pendant_{i}_gold',(x-.64,y-.64,3.85),(x+.64,y+.64,4.06),'gold',ceiling,.04)
        box(f'pendant_{i}_diffuser',(x-.55,y-.55,3.82),(x+.55,y+.55,3.86),'glow',ceiling,.025)
        beam(f'pendant_{i}_cable',(x,y,4.06),(x,y,5.2),.025,.025,'slate',ceiling)

    # Anteprima: luci e camere separate dall'asset esportabile.
    world=bpy.data.worlds.new('ATRIO_World');world.use_nodes=True;scene.world=world
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.78,.84,.90,1);bg.inputs['Strength'].default_value=.40
    def area(name,pos,target,energy,size,color=(1,.95,.87)):
        d=bpy.data.lights.new('atrio_preview_'+name,'AREA');d.energy=energy;enum(d,'shape','DISK');d.size=size;d.color=color
        o=bpy.data.objects.new(d.name,d);preview.objects.link(o);o.location=pos
        o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    area('ambient',(0,-2,4.42),(0,-2,0),4500,15)
    area('reception',(0,9.0,4.35),(0,9,0),2200,9)
    area('stairs',(-12.8,7.3,4.7),(-12.8,6.5,1),900,5)
    area('east_window',(17.5,-1,3.5),(0,0,1.3),3000,10,(.78,.88,1))
    area('west_window',(-17.5,-1,3.5),(0,0,1.3),3000,10,(.78,.88,1))
    area('entrance_fill',(0,-11,4),(0,8,1.5),2600,10)
    def camera(name,pos,target,lens=21,ortho=None):
        d=bpy.data.cameras.new('atrio_preview_camera_'+name);d.lens=lens;d.clip_end=300
        o=bpy.data.objects.new(d.name,d);preview.objects.link(o);o.location=pos
        o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
        if ortho:
            enum(d,'type','ORTHO');d.ortho_scale=ortho
        return o
    cam=camera('entrance',(0,-11.8,3.6),(0,8.5,2.45),19)
    camera('reception',(-8.1,-2.9,3.25),(1,9.1,2.3),23)
    camera('top',(0,0,43),(0,0,0),ortho=40)
    scene.camera=cam
    try:scene.render.engine='CYCLES'
    except TypeError as exc:raise RuntimeError('Cycles non disponibile: '+str(exc))
    scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    enum(scene.render.image_settings,'file_format','PNG')
    enum(scene.view_settings,'view_transform','AgX')
    scene.view_settings.exposure=-1.3
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type=='VIEW_3D':
                enum(a.spaces.active.shading,'type','MATERIAL')
                if a.spaces.active.region_3d:
                    enum(a.spaces.active.region_3d,'view_perspective','CAMERA')
                    a.spaces.active.region_3d.view_camera_zoom=0
    bpy.context.view_layer.update()
    manifest={
        'stage':'v03_visual_draft_not_runtime_integrated','blender_version':bpy.app.version_string,
        'units':'meters','blender_axes':{'up':'+Z','north':'+Y'},
        'gltf_from_blender':['x','z','-y'],'root':root.name,'scene':scene.name,
        'design_xy_m':{'min_x':-18,'max_x':18,'min_y':-13,'max_y':13},
        'internal_height_m':HEIGHT,'reception_center_x_m':0,
        'view_convention':'Ingresso a sud; guardando a nord: scale a sinistra, ascensore a destra.',
        'elevator_reserved_xy_m':{'min_x':7.2,'max_x':9.8,'min_y':10.6,'max_y':13},
        'elevator_note':'Intaglio aperto come nella sala riunioni: niente pavimento, soffitto, parete nord, portale o tamponamenti nel vano. Ascensore generato dall’applicazione.',
        'stairs':{'type':'U_two_flights','risers':30,'riser_m':rise,'tread_m':run,
                  'width_m':2.6,'landing_height_m':2.6,'upper_level_m':5.2,
                  'note':'Bozza geometrica: collegamento ai piani, navigazione e conformità edilizia non verificati.'},
        'reception':{'outer_width_m':11.46,'countertop_height_m':1.31,'staff_positions':2},
        'materials':{mats[n].name:{'srgb':list(rgb)} for n,rgb in palette.items()},
        'colliders_reference_boxes':colliders,
        'limitations':['Design in revisione con Juri.','Nessun contratto tecnico specifico atrio ricevuto.',
                       'Collisioni e navigazione runtime non implementate o certificate.',
                       'Nessuna validazione normativa delle scale.',
                       'Illuminazione di anteprima esclusa dal GLB.'],
    }
    enrichment_script=Path(__file__).resolve().parent/'enrich_lobby.py'
    enrichment_ns={'__file__':str(enrichment_script),'__name__':'atrio_enrichment'}
    exec(compile(enrichment_script.read_text(encoding='utf-8'),str(enrichment_script),'exec'),enrichment_ns)
    enrichment=enrichment_ns['enrich'](scene)
    manifest['enrichment']=enrichment
    manifest['colliders_reference_boxes'].extend(enrichment['colliders'])
    manifest['materials']['atrio_mat_logo_blank']={'srgb':list(palette['cream'])}
    (output/'atrium.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    scene['atrio_output']=str(output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'atrium.blend'))
    print(json.dumps({'scene':scene.name,'file':str(output/'atrium.blend'),'objects':len(scene.objects),
                      'root':root.name,'retained_scenes':[s.name for s in bpy.data.scenes if s!=scene]},indent=2))
    return scene


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output-dir',default=str(Path(__file__).resolve().parent/'v03'))
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    build(args.output_dir)
