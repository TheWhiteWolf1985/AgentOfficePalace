"""Tre file parallele a X: rack 800x1200x2200, server stilizzati e porte vetrate.
Geometria originale procedurale, mesh condivise tra istanze. Nessuna risorsa esterna.
"""
import math
import bpy
from mathutils import Vector


def add_racks(scene,root,asset,preview,prefix):
    def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    colors={
        'cabinet':(.15,.18,.21),'edge':(.25,.29,.32),'black':(.055,.07,.08),
        'server':(.43,.48,.52),'silver':(.64,.69,.72),'drive':(.20,.24,.27),
        'green':(.26,.88,.42),'cyan':(.22,.69,.86),'amber':(.96,.64,.18),
        'blue_cable':(.16,.43,.67),'power_cable':(.12,.13,.15),
        'label':(.82,.87,.89),'glass':(.65,.78,.82),
    }
    mats={}
    for name,rgb in colors.items():
        m=bpy.data.materials.new(prefix+'rack_mat_'+name);m.use_nodes=True
        sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        sh.inputs['Base Color'].default_value=(*map(linear,rgb),1)
        sh.inputs['Roughness'].default_value=.58
        if name in ('server','silver','edge'):sh.inputs['Metallic'].default_value=.35
        if name in ('green','cyan','amber'):
            sh.inputs['Emission Color'].default_value=(*map(linear,rgb),1)
            sh.inputs['Emission Strength'].default_value=.8
        if name=='glass':
            sh.inputs['Alpha'].default_value=.12
            sh.inputs['Roughness'].default_value=.13
            # Transparent surface, readable through in both EEVEE and GLB.
            if hasattr(m,'surface_render_method'):
                methods=[i.identifier for i in m.bl_rna.properties['surface_render_method'].enum_items]
                if 'BLENDED' not in methods:raise RuntimeError('Trasparenza BLENDED non disponibile: '+str(methods))
                m.surface_render_method='BLENDED'
            if hasattr(m,'use_transparent_shadow'):m.use_transparent_shadow=True
            m.use_backface_culling=False
        m.diffuse_color=(*rgb,.12 if name=='glass' else 1)
        mats[name]=m
    material_order=list(mats)
    cube_faces=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]

    class Parts:
        def __init__(self):self.v=[];self.f=[];self.ids=[]
        def box(self,lo,hi,mat):
            off=len(self.v)
            self.v.extend((x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0]))
            self.f.extend(tuple(off+i for i in f) for f in cube_faces)
            self.ids.extend([material_order.index(mat)]*6)
        def quad(self,coords,mat):
            off=len(self.v);self.v.extend(coords)
            self.f.append(tuple(range(off,off+4)));self.ids.append(material_order.index(mat))
        def data(self,name):
            me=bpy.data.meshes.new(prefix+name+'_mesh');me.from_pydata(self.v,[],self.f);me.update()
            used=sorted(set(self.ids))
            for i in used:me.materials.append(mats[material_order[i]])
            for poly,i in zip(me.polygons,self.ids):poly.material_index=used.index(i)
            return me

    def empty(name,parent):
        ob=bpy.data.objects.new(prefix+name,None);asset.objects.link(ob);ob.parent=parent
        ob.empty_display_size=.10
        return ob

    # Cabinet footprint .8 x 1.2 m; including levelling feet, total height 2.20 m.
    shell=Parts()
    for x in (-.34,.34):
        for y in (-.53,.53):
            shell.box((x-.035,y-.035,0),(x+.035,y+.035,.04),'black')
            shell.box((x-.027,y-.027,.07),(x+.027,y+.027,2.18),'edge')
    shell.box((-.4,-.6,.04),(.4,.6,.075),'cabinet')
    shell.box((-.4,-.6,2.18),(.4,.6,2.20),'cabinet')
    for x in (-.4,.377):
        shell.box((x,-.565,.075),(x+.023,.565,2.18),'cabinet')
    # 19-inch front/back mounting rails and small mounting holes.
    for x in (-.273,.248):
        for y in (-.50,.43):
            shell.box((x,y,.075),(x+.025,y+.025,2.165),'silver')
            for u in range(47):
                z=.085+u*.04445
                shell.box((x+.007,y-.001,z),(x+.018,y+.001,z+.008),'black')
    for x in (-.32,.30):
        shell.box((x,.49,.13),(x+.025,.53,2.10),'edge')
        for z in [i*.085+.18 for i in range(22)]:
            shell.box((x+.005,.532,z),(x+.020,.537,z+.023),'black')
    # A bundled cable route within the cabinet and two power strips at the rear.
    for x in (-.30,.30):
        shell.box((x-.008,.46,.14),(x+.008,.48,2.08),'blue_cable')
        shell.box((x-.022,.50,.12),(x-.012,.52,2.09),'power_cable')
    shell_data=shell.data('rack_shell')

    def door_data(rear=False):
        p=Parts();y=.59 if rear else -.59
        for x in (-.356,.322):p.box((x,y-.012,.082),(x+.034,y+.012,2.17),'edge')
        for z in (.082,2.133):p.box((-.322,y-.012,z),(.322,y+.012,z+.037),'edge')
        # One completely clear glass pane with a structural dark frame.
        p.quad([(-.322,y,.119),(.322,y,.119),(.322,y,2.133),(-.322,y,2.133)],'glass')
        for z in (.32,1.07,1.83):p.box((-.366,y-.016,z),(-.345,y+.016,z+.075),'black')
        handle_y=(y+.014,y+.034) if rear else (y-.034,y-.014)
        p.box((.326,handle_y[0],1.01),(.343,handle_y[1],1.22),'silver')
        return p.data('rack_rear_door' if rear else 'rack_front_door')
    front_data=door_data();rear_data=door_data(True)

    def device(kind,units):
        p=Parts();height=units*.04445-.003
        p.box((-.233,-.475,0),(.233,.37,height),'black')
        p.box((-.2413,-.505,0),(.2413,-.478,height),'server')
        # Rack ears, fastening points and handles.
        for x in (-.239,.225):
            p.box((x,-.512,.004),(x+.014,-.501,height-.004),'silver')
            p.box((x+.004,-.514,.012),(x+.010,-.511,.019),'black')
        if kind in ('compute','storage'):
            rows=1 if kind=='compute' else 2
            for row in range(rows):
                for d in range(8):
                    x=-.215+d*.046;z=.008+row*(height/2)
                    h=min(.064,height/rows-.014)
                    p.box((x,-.513,z),(x+.040,-.505,z+h),'drive')
                    p.box((x+.003,-.517,z+.004),(x+.033,-.513,z+.009),'silver')
                    p.box((x+.034,-.518,z+.012),(x+.038,-.514,z+.018),'green')
            for side in (-1,1):
                x=side*.218
                p.box((x-.004,-.531,.022),(x+.004,-.515,min(height-.01,.065)),'black')
        elif kind in ('switch','patch'):
            for d in range(12):
                x=-.208+d*.0335
                p.box((x,-.515,.010),(x+.026,-.505,.028),'black')
                p.box((x+.003,-.519,.012),(x+.022,-.515,.024),'cyan' if kind=='switch' else 'silver')
                if d%2==0:p.box((x+.002,-.521,.032),(x+.005,-.517,.035),'green')
            if kind=='patch':
                for d in range(6):
                    x=-.19+d*.067
                    p.box((x,-.536,-.028),(x+.005,-.529,.02),'blue_cable')
        elif kind=='ups':
            p.box((-.18,-.514,height*.35),(-.06,-.505,height*.7),'black')
            p.box((-.17,-.517,height*.4),(-.07,-.514,height*.65),'cyan')
            for d in range(7):
                x=.01+d*.025
                p.box((x,-.514,.025),(x+.008,-.505,height-.025),'black')
        elif kind=='blank':
            # Airflow blanking plate, no fictitious equipment in unused U.
            p.box((-.215,-.512,.009),(.215,-.505,height-.009),'cabinet')
        # Service indicator and rear redundant PSU/port block for active devices.
        if kind not in ('blank','patch'):
            p.box((.179,-.521,height-.018),(.188,-.515,height-.009),'green')
            p.box((.195,-.521,height-.018),(.204,-.515,height-.009),'cyan')
            for x in (-.21,-.11):
                p.box((x,.37,.008),(x+.086,.405,height-.008),'edge')
                p.box((x+.01,.405,.016),(x+.074,.413,min(height-.009,.045)),'black')
            for x in (.05,.10,.15):p.box((x,.372,.018),(x+.033,.388,min(height-.008,.041)),'black')
        return p.data('rack_device_'+kind+'_'+str(units)+'u')

    layouts=[(0,4,'ups'),(4,4,'storage')]
    layouts += [(8+i*2,2,'compute') for i in range(14)]
    layouts += [(36,4,'blank'),(40,1,'patch'),(41,1,'switch'),(42,1,'switch'),(43,4,'blank')]
    device_data={(kind,u):device(kind,u) for _,u,kind in layouts}
    group=empty('racks',root)
    racks=[];boxes=[]
    # Latest image defines the overall area, rather than a compact bank by the wall.
    # Approximate floor rectangle recovered from the image and the floor grid:
    # X[-14,5.3], Y[-9.8,7.3]. All cabinets/handles are inside with margins.
    requested_rect={'min':[-16.,-9.8,0.],'max':[3.3,7.3,2.2]}
    row_y=(-8.5,-1.,6.5)
    rack_count=20
    right_edge=3.1
    first_x=right_edge-.4-(rack_count-1)*.85
    for row,y in enumerate(row_y,1):
        row_group=empty(f'rack_row_{row:02}',group)
        for col in range(rack_count):
            x=first_x+.85*col
            rack_id=f'rack_{row:02}_{col+1:02}'
            cabinet=empty(rack_id,row_group);cabinet.location=(x,y,0)
            # Alternate the middle row to establish facing front/rear service sides.
            cabinet.rotation_euler.z=math.pi if row==2 else 0
            cabinet['height_m']=2.2;cabinet['nominal_u']=47
            cabinet['row']=row;cabinet['column']=col+1
            def instance(label,data,parent=cabinet,z=0):
                ob=bpy.data.objects.new(prefix+rack_id+'_'+label,data)
                asset.objects.link(ob);ob.parent=parent;ob.location.z=z
                return ob
            instance('shell',shell_data)
            front=instance('door_front',front_data);rear=instance('door_rear',rear_data)
            front['role']='framed_glass_door';rear['role']='framed_glass_door'
            equipment=[]
            for u,units,kind in layouts:
                ob=instance(f'{kind}_u{u:02}',device_data[kind,units],z=.075+u*.04445)
                ob['rack_u_start']=u+1;ob['rack_units']=units;ob['device_type']=kind
                equipment.append(ob.name)
            lo=[x-.4,y-.624,0];hi=[x+.4,y+.624,2.2]
            boxes.append({'node':cabinet.name,'min_blender_m':lo,'max_blender_m':hi,'role':'rack_reference_box'})
            racks.append({'id':rack_id,'node':cabinet.name,'row':row,'column':col+1,
                'position_blender_m':[x,y,0],'height_m':2.2,'width_m':.8,'depth_m':1.2,
                'front_axis':'+Y' if row==2 else '-Y','rack_units':47,
                'doors':[front.name,rear.name],'door_style':'framed_clear_glass',
                'equipment_nodes':equipment,'compute_servers':14,'storage_servers':1,
                'switches':2,'ups':1,'patch_panels':1})
    # Preview of the three rows from the same broad direction as Juri's image.
    for label,pos,target,lens in [
        ('overview',(32,-24,34),(0,0,.7),33),
        ('rack_detail',(-9,-12,1.65),(-10.4,-8.5,1.2),34),
        ('aisle',(8,2.75,1.75),(-10,2.75,1.25),24)]:
        data=bpy.data.cameras.new(prefix+'preview_'+label)
        ob=bpy.data.objects.new(data.name,data);preview.objects.link(ob)
        ob.location=pos;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.lens=lens;data.clip_end=200
    # Subtle light for reading server faces through the glass, preview only.
    for i,y in enumerate((-10.5,-3.,4.5)):
        data=bpy.data.lights.new(prefix+f'preview_rack_fill_{i}','AREA');data.energy=350;data.size=10
        ob=bpy.data.objects.new(data.name,data);preview.objects.link(ob);ob.location=(-5,y,3.8)
        ob.rotation_euler=(Vector((-5,y+2,1))-ob.location).to_track_quat('-Z','Y').to_euler()
    return {'racks':racks,'colliders':boxes,'layout':{
        'rows':3,'racks_per_row':20,'total_racks':60,'row_axis':'X',
        'row_y_m':list(row_y),'row_x_centers_m':[first_x,right_edge-.4],
        'bay_pitch_m':.85,'door_style':'framed_clear_glass',
        'clear_aisle_between_rows_m':6.252,'nominal_cabinet_m':[.8,1.2,2.2],
        'right_edge_blender_x_m':right_edge,'aligned_to':'inside_latest_annotated_rectangle',
        'requested_floor_rectangle_m':requested_rect,
        'rectangle_source':'previous image rectangle translated -2m in X by explicit request',
        'translation_from_v08_m':[-2,0,0],
        'description':'Twenty cabinets per row, shifted two meters toward the west short wall. Equipment is visual only.'},
        'palette_srgb':colors}
