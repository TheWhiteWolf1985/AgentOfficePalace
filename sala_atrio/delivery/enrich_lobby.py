"""Arredi v03 e superficie logo vuota; modulo condiviso fra live e builder."""
import math
import bpy
from mathutils import Vector


def enrich(scene):
    if 'atrio_waiting_left' in scene.objects:
        raise RuntimeError('Arredamento v03 già presente')
    asset=bpy.data.collections['ATRIO_Asset']
    furniture=bpy.data.objects['atrio_furniture']
    architecture=bpy.data.objects['atrio_architecture']
    anchors=bpy.data.objects['atrio_anchors']
    materials={k:bpy.data.materials['atrio_mat_'+k] for k in
               ['cream','sand','wood_light','wood_warm','wood_edge','slate','ink',
                'teal','orange','leaf','leaf_light','terracotta','soil','rug']}
    extra_boxes=[];seats=[];plants=[]
    for name in ['atrio_brand','atrio_brand_palace']:
        ob=bpy.data.objects.get(name)
        if ob is not None and ob.name in scene.objects:
            bpy.data.objects.remove(ob,do_unlink=True)
    backing=bpy.data.objects['atrio_brand_panel']
    backing.name='atrio_logo_backing'
    logo_mat=materials['cream'].copy();logo_mat.name='atrio_mat_logo_blank'
    materials['logo_blank']=logo_mat

    def empty(name,parent):
        ob=bpy.data.objects.new('atrio_'+name,None);asset.objects.link(ob);ob.parent=parent
        ob.empty_display_size=.25
        return ob
    def mesh(name,v,f,mat,parent,bevel=0):
        me=bpy.data.meshes.new('atrio_'+name+'_mesh');me.from_pydata(v,[],f);me.update()
        me.materials.append(materials[mat])
        ob=bpy.data.objects.new('atrio_'+name,me);asset.objects.link(ob);ob.parent=parent
        if bevel:
            valid=[e.identifier for e in bpy.types.Modifier.bl_rna.properties['type'].enum_items]
            if 'BEVEL' not in valid:raise RuntimeError('BEVEL non disponibile')
            mod=ob.modifiers.new('Bordi_morbidi','BEVEL');mod.width=bevel;mod.segments=2
        return ob
    def box(name,lo,hi,mat,parent,bevel=.025):
        v=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        f=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]
        return mesh(name,v,f,mat,parent,bevel)
    def ellipse(name,x,y,z0,z1,rx,ry,mat,parent,n=40):
        v=[(x+rx*math.cos(i*math.tau/n),y+ry*math.sin(i*math.tau/n),z)
           for z in (z0,z1) for i in range(n)]
        f=[tuple(reversed(range(n))),tuple(range(n,n*2))]
        f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return mesh(name,v,f,mat,parent,.015)
    def collider(name,lo,hi,parent):
        bpy.context.view_layer.update()
        pts=[parent.matrix_world@Vector((x,y,z)) for x in [lo[0],hi[0]]
             for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]]
        extra_boxes.append({'node':parent.name,'id':name,
                            'min_blender_m':[min(v[i] for v in pts) for i in range(3)],
                            'max_blender_m':[max(v[i] for v in pts) for i in range(3)]})
    def seat(tag,parent,x,y,z=.58):
        s=empty('lounge_seat_'+tag,anchors);stand=empty('lounge_stand_'+tag,anchors)
        bpy.context.view_layer.update()
        s.location=parent.matrix_world@Vector((x,y,z))
        stand.location=parent.matrix_world@Vector((x,y-1.15,0))
        s.rotation_euler.z=parent.rotation_euler.z
        s['role']='waiting';s['forward_axis']='-Y';s['stand_node']=stand.name
        seats.append({'seat':s.name,'stand':stand.name,'position_blender_m':list(s.location),
                      'stand_blender_m':list(stand.location),'yaw_z_rad':s.rotation_euler.z})

    # Superficie separata senza scritte o immagini: logo applicato in altra sede.
    logo=mesh('company_logo_surface',[(-3.72,12.625,2.65),(3.72,12.625,2.65),
             (3.72,12.625,4.35),(-3.72,12.625,4.35)],[(0,1,2,3)],'logo_blank',architecture)
    uv=logo.data.uv_layers.new(name='UVMap')
    for loop,xy in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=xy
    logo['role']='company_logo_image_surface';logo['image_loaded']=False

    def sofa(tag,x,y):
        group=empty(tag,furniture);group.location=(x,y,0)
        box(tag+'_base',(-2.38,-.68,.18),(2.38,.68,.42),'wood_warm',group,.06)
        box(tag+'_back',(-2.38,.45,.45),(2.38,.78,1.37),'teal',group,.11)
        for i in range(3):
            xx=-2.12+i*1.43
            box(tag+f'_cushion_{i}',(xx,-.65,.42),(xx+1.35,.43,.62),'teal',group,.09)
            seat(tag+str(i),group,xx+.675,-.04,.62)
        for i,xx in enumerate([-2.38,2.08]):
            box(tag+f'_arm_{i}',(xx,-.68,.42),(xx+.30,.69,.91),'teal',group,.08)
        for xx in [-1.95,1.95]:
            for yy in [-.43,.43]:box(tag+'_foot_'+str(xx)+'_'+str(yy),(xx-.07,yy-.07,.03),(xx+.07,yy+.07,.20),'slate',group,.01)
        for i,xx in enumerate([-1.55,1.55]):
            ob=box(tag+f'_pillow_{i}',(-.29,-.12,-.29),(.29,.12,.29),
                   'orange' if i==0 else 'cream',group,.08)
            ob.location=(xx,.35,.96);ob.rotation_euler.y=.18 if i==0 else -.18
        collider(tag,(-2.38,-.68,0),(2.38,.78,1.37),group)
        return group
    def chair(tag,x,y,mat):
        group=empty(tag,furniture);group.location=(x,y,0);group.rotation_euler.z=math.pi
        box(tag+'_seat',(-.58,-.55,.40),(.58,.55,.62),mat,group,.10)
        box(tag+'_back',(-.62,.35,.51),(.62,.66,1.29),mat,group,.10)
        for xx in [-.68,.48]:box(tag+'_arm_'+str(xx),(xx,-.55,.42),(xx+.20,.60,.88),mat,group,.06)
        for xx in [-.42,.42]:
            for yy in [-.36,.36]:box(tag+'_leg_'+str(xx)+'_'+str(yy),(xx-.04,yy-.04,.03),(xx+.04,yy+.04,.41),'wood_edge',group,.01)
        collider(tag,(-.68,-.55,0),(.68,.66,1.29),group)
        seat(tag,group,0,0,.62)
        return group
    def table(tag,x,y,rx=1.35,ry=.78,height=.48):
        group=empty(tag,furniture);group.location=(x,y,0)
        ellipse(tag+'_top',0,0,height-.08,height,rx,ry,'wood_light',group)
        for xx in [-rx*.62,rx*.62]:
            for yy in [-ry*.55,ry*.55]:box(tag+'_leg_'+str(xx)+'_'+str(yy),(xx-.045,yy-.045,.035),(xx+.045,yy+.045,height-.08),'slate',group,.01)
        collider(tag,(-rx,-ry,0),(rx,ry,height),group)
        return group
    for side,x in [('left',-7.8),('right',7.8)]:
        waiting=empty('waiting_'+side,furniture)
        # Gruppi funzionali nominati; arredi indipendenti sotto furniture.
        waiting['role']='waiting_zone';waiting.location=(x,-3.0,0)
        ellipse('waiting_rug_'+side,x,-3.0,.004,.016,3.50,3.85,'sand',furniture)
        sofa('sofa_'+side,x,-.7)
        chair('armchair_'+side+'_a',x-1.4,-5.6,'orange' if side=='left' else 'cream')
        chair('armchair_'+side+'_b',x+1.4,-5.6,'cream' if side=='left' else 'orange')
        table('coffee_table_'+side,x,-3.0)
        table('side_table_'+side,x+(-3 if x<0 else 3),-.6,.48,.48,.61)
        # Vassoio e due piccoli libri sul tavolino centrale.
        ellipse('tray_'+side,x,-3.0,.48,.505,.40,.25,'slate',furniture,24)
        box('book_'+side,(x+.40,-3.25,.48),(x+.85,-2.70,.535),'orange',furniture,.01)
        box('book_top_'+side,(x+.44,-3.22,.535),(x+.83,-2.74,.575),'cream',furniture,.01)

    # Consolle lungo i lati, senza restringere il percorso centrale.
    for side,x in [('left',-16.65),('right',16.65)]:
        group=empty('console_'+side,furniture);group.location=(x,3.0,0)
        box('console_'+side+'_body',(-.39,-1.40,.18),(.39,1.40,.88),'wood_warm',group,.035)
        box('console_'+side+'_top',(-.46,-1.46,.88),(.46,1.46,.98),'wood_light',group,.025)
        for yy in [-.68,.68]:
            xx=.401 if x<0 else -.421
            box('console_'+side+'_handle_'+str(yy),(xx,yy-.18,.57),(xx+.02,yy+.18,.61),'slate',group,.01)
        collider('console_'+side,(-.46,-1.46,0),(.46,1.46,.98),group)

    def plant(tag,x,y,scale=1,z=0):
        group=empty(tag,furniture);group.location=(x,y,z);plants.append(group.name)
        s=scale
        def ring(suffix,z0,z1,r0,r1,mat):
            n=12;v=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),zz)
                       for zz,r in [(z0*s,r0*s),(z1*s,r1*s)] for i in range(n)]
            f=[tuple(reversed(range(n))),tuple(range(n,n*2))]
            f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
            return mesh(tag+suffix,v,f,mat,group,.01)
        ring('_pot',.02,.74,.34,.49,'terracotta')
        ring('_rim',.68,.80,.53,.53,'orange')
        ring('_soil',.80,.815,.45,.45,'soil')
        box(tag+'_stem',(-.028*s,-.028*s,.81*s),(.028*s,.028*s,2.55*s),'wood_edge',group,.005)
        v=[];f=[]
        for i in range(18):
            angle=i*2.399963;zz=.97+i*.085;r=.76 if i<12 else .52
            p=Vector((0,0,zz))*s;tip=Vector((r*math.cos(angle),r*math.sin(angle),zz+.53))*s
            mid=(p+tip)*.5;wing=Vector((-.21*math.sin(angle),.21*math.cos(angle),.07))*s
            a=len(v);v.extend([p,mid+wing,tip,mid-wing]);f.extend([(a,a+1,a+2),(a,a+2,a+3)])
        ob=mesh(tag+'_leaves',v,f,'leaf',group);ob.data.materials.append(materials['leaf_light'])
        for poly in ob.data.polygons:poly.material_index=(poly.index//2)%2
        collider(tag,(-.53*s,-.53*s,0),(.53*s,.53*s,.8*s),group)
    for tag,x,y,s in [('plant_wait_left_front',-12,-6.8,1.05),('plant_wait_right_front',12,-6.8,1.05),
                      ('plant_entrance_left',-4.5,-9.1,.90),('plant_entrance_right',4.5,-9.1,.90),
                      ('plant_wait_left_back',-11.8,1.6,1.15),('plant_wait_right_back',11.8,1.6,1.15),
                      ('plant_north_right',15.4,9.6,1.15),('plant_north_left',-8.2,11.2,.90)]:
        plant(tag,x,y,s)
    for side,x in [('left',-16.65),('right',16.65)]:
        plant('plant_console_'+side,x,3.2,.46,.98)
    bpy.context.view_layer.update()
    # Inquadratura più larga per includere le nuove sedute laterali.
    cam=bpy.data.objects['atrio_preview_camera_entrance'];cam.data.lens=15
    cam.location=(0,-12.15,3.9)
    cam.rotation_euler=(Vector((0,4.5,1.9))-cam.location).to_track_quat('-Z','Y').to_euler()
    return {'logo':{'surface':logo.name,'backing':backing.name,'material':logo_mat.name,
                    'width_m':7.44,'height_m':1.70,'uv':'0..1 non specchiate','image_loaded':False},
            'added_furnishings':{'sofas':2,'armchairs':4,'coffee_tables':2,'side_tables':2,
                                'consoles':2,'rugs':2,'plants':len(plants)},
            'new_plant_nodes':plants,'waiting_seats':seats,'colliders':extra_boxes,
            'note':'Arredo aggiunto su richiesta di Juri; passaggi centrali e vano ascensore conservati.'}
