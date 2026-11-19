"""Zona operativa esterna: due PC, manutenzione, armadi ricambi. Geometria originale."""
import math
import bpy
from mathutils import Matrix,Vector


def add_operations(scene,root,asset,preview,prefix):
    colors={'top':(.72,.77,.78),'frame':(.23,.29,.32),'body':(.43,.49,.52),
            'drawer':(.56,.62,.65),'dark':(.10,.15,.18),'teal':(.20,.49,.51),
            'seat':(.25,.37,.40),'silver':(.69,.74,.76),'screen':(.075,.17,.21),
            'ui':(.31,.66,.69),'ui_dim':(.19,.39,.44),'green':(.27,.75,.43),
            'orange':(.86,.35,.18),'rubber':(.13,.18,.20),'pcb':(.20,.40,.29),
            'chip':(.12,.16,.18),'label':(.88,.92,.93),'lamp':(.96,.96,.86)}
    mats={}
    for name,rgb in colors.items():
        m=bpy.data.materials.new(prefix+'ops_mat_'+name);m.use_nodes=True
        sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
        sh.inputs['Base Color'].default_value=(*map(linear,rgb),1)
        sh.inputs['Roughness'].default_value=.68
        if name=='silver':sh.inputs['Metallic'].default_value=.6
        if name in ('ui','green','lamp'):
            sh.inputs['Emission Color'].default_value=(*map(linear,rgb),1)
            sh.inputs['Emission Strength'].default_value=.35 if name!='lamp' else 1
        m.diffuse_color=(*rgb,1);mats[name]=m
    faces_box=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]

    class Parts:
        def __init__(self):self.v=[];self.f=[];self.ids=[]
        def add(self,verts,faces,material):
            off=len(self.v);self.v.extend(verts)
            self.f.extend(tuple(off+i for i in f) for f in faces);self.ids.extend([material]*len(faces))
        def box(self,lo,hi,mat):
            self.add([(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])],faces_box,mat)
        def cylinder(self,c,r,z0,z1,mat,n=16):
            v=[(c[0]+r*math.cos(i*math.tau/n),c[1]+r*math.sin(i*math.tau/n),z)
               for z in (z0,z1) for i in range(n)]
            self.add(v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+
                     [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)
        def beam(self,a,b,width,mat):
            d=Vector(b)-Vector(a);q=d.to_track_quat('Z','Y');center=(Vector(a)+Vector(b))/2
            self.add([tuple(center+q@Vector((x,y,z))) for z in (-d.length/2,d.length/2)
                      for y in (-width/2,width/2) for x in (-width/2,width/2)],faces_box,mat)
        def make(self,label,parent):
            data=bpy.data.meshes.new(prefix+label+'_mesh');data.from_pydata(self.v,[],self.f);data.update()
            used=list(dict.fromkeys(self.ids))
            for material in used:data.materials.append(mats[material])
            for p,material in zip(data.polygons,self.ids):p.material_index=used.index(material)
            ob=bpy.data.objects.new(prefix+label,data);asset.objects.link(ob);ob.parent=parent
            return ob

    def empty(label,parent):
        ob=bpy.data.objects.new(prefix+label,None);asset.objects.link(ob);ob.parent=parent
        ob.empty_display_size=.1
        return ob
    group=empty('operations_area',root)
    boxes=[]
    def collision(node,lo,hi,role):
        boxes.append({'node':node,'min_blender_m':list(lo),'max_blender_m':list(hi),'role':role})
    def label(text,name,parent,position,size,rotation):
        cu=bpy.data.curves.new(prefix+name+'_font','FONT');cu.body=text;cu.size=size
        options=[i.identifier for i in cu.bl_rna.properties['align_x'].enum_items]
        if 'CENTER' in options:cu.align_x='CENTER'
        cu.materials.append(mats['label'])
        ob=bpy.data.objects.new(prefix+name,cu);asset.objects.link(ob);ob.parent=parent
        ob.location=position;ob.rotation_mode='QUATERNION';ob.rotation_quaternion=rotation
        bpy.context.view_layer.update()
        me=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        # Nome stabile come nell'asset approvato, indipendente dalla lingua di Blender.
        for layer in me.uv_layers:layer.name='Mappa UV'
        name_ob=ob.name;matrix=ob.matrix_basis.copy();bpy.data.objects.remove(ob,do_unlink=True)
        ob=bpy.data.objects.new(name_ob,me);asset.objects.link(ob);ob.parent=parent;ob.matrix_basis=matrix
        return ob

    # Continuous desk; operators face -X through the partition.
    desk=empty('control_desk',group)
    p=Parts();p.box((9.7,-7.5,.73),(10.95,-1.7,.79),'top')
    p.box((10.92,-7.5,.715),(10.96,-1.7,.755),'teal')
    for y in (-7.31,-1.89):
        for x in (9.83,10.78):p.box((x-.035,y-.035,.06),(x+.035,y+.035,.73),'frame')
        p.box((9.76,y-.05,.045),(10.86,y+.05,.085),'frame')
    p.box((9.79,-7.26,.52),(9.86,-1.94,.60),'frame')
    p.box((9.87,-7.2,.58),(10.15,-2.0,.66),'dark')
    p.make('control_desk_structure',desk)
    collision(desk.name,(9.7,-7.5,0),(10.96,-1.7,.79),'control_desk')
    stations=[];screens=[];seats=[]
    for i,y in enumerate((-6.05,-3.15),1):
        station=empty(f'workstation_{i:02}',desk)
        for j,yy in enumerate((y-.43,y+.43),1):
            monitor=empty(f'workstation_{i:02}_monitor_{j:02}',station)
            p=Parts();p.box((9.93,yy-.19,.79),(10.22,yy+.19,.815),'frame')
            p.box((10.055,yy-.035,.815),(10.105,yy+.035,1.18),'frame')
            p.box((10.025,yy-.39,1.10),(10.095,yy+.39,1.60),'dark')
            p.make(f'workstation_{i:02}_monitor_{j:02}_body',monitor)
            # Normal +X points toward the chair at X11.8.
            me=bpy.data.meshes.new(prefix+f'ops_screen_{i}_{j}_mesh')
            me.from_pydata([(10.096,yy-.355,1.135),(10.096,yy+.355,1.135),
                           (10.096,yy+.355,1.565),(10.096,yy-.355,1.565)],[],[(0,1,2,3)])
            me.materials.append(mats['screen']);me.update()
            ob=bpy.data.objects.new(prefix+f'ops_screen_{i}_{j}',me);asset.objects.link(ob);ob.parent=monitor
            uv=me.uv_layers.new(name='UVMap')
            for loop,coord in zip(me.polygons[0].loop_indices,((0,0),(1,0),(1,1),(0,1))):uv.data[loop].uv=coord
            screens.append(ob.name)
            p=Parts();p.box((10.098,yy-.327,1.50),(10.100,yy+.327,1.524),'ui_dim')
            for line in range(6):
                zz=1.445-line*.045;length=(.34,.47,.29,.43,.37,.52)[line]
                p.box((10.098,yy-.30,zz),(10.100,yy-.30+length,zz+.012),'ui' if line%2==0 else 'ui_dim')
            p.make(f'workstation_{i:02}_monitor_{j:02}_terminal_graphics',monitor)
        p=Parts();p.box((10.49,y-.34,.795),(10.77,y+.34,.817),'dark')
        for row in range(4):
            for key in range(12):
                xx=10.51+row*.057;yy=y-.31+key*.051
                p.box((xx,yy,.817),(xx+.043,yy+.040,.826),'body')
        p.box((10.52,y+.46,.794),(10.75,y+.69,.802),'rubber')
        p.box((10.59,y+.51,.802),(10.70,y+.60,.84),'frame')
        p.box((10.605,y+.545,.84),(10.63,y+.56,.846),'silver')
        p.box((10.05,y-.94,.035),(10.54,y-.69,.58),'dark')
        p.box((10.541,y-.92,.08),(10.553,y-.71,.54),'body')
        for slat in range(8):
            yy=y-.90+slat*.022
            p.box((10.554,yy,.12),(10.558,yy+.01,.34),'dark')
        p.box((10.558,y-.91,.43),(10.562,y-.73,.447),'teal')
        p.box((10.558,y-.91,.49),(10.563,y-.88,.515),'green')
        p.make(f'workstation_{i:02}_keyboard_mouse_pc',station)
        chair=empty(f'ops_chair_{i:02}',group);chair.location=(11.8,y,0)
        p=Parts();p.cylinder((0,0),.055,.10,.46,'silver')
        for spoke in range(5):
            a=spoke*math.tau/5;end=(.37*math.cos(a),.37*math.sin(a),.10)
            p.beam((0,0,.14),end,.04,'frame')
            p.box((end[0]-.045,end[1]-.027,.035),(end[0]+.045,end[1]+.027,.10),'dark')
        p.box((-.34,-.34,.45),(.34,.34,.53),'seat')
        p.box((.29,-.33,.52),(.40,.33,1.12),'seat')
        p.box((.31,-.30,1.12),(.40,.30,1.23),'dark')
        for side in (-1,1):
            yy=side*.39
            p.box((-.21,yy-.025,.69),(.28,yy+.025,.74),'frame')
            p.box((.16,yy-.02,.48),(.20,yy+.02,.69),'frame')
        p.make(f'ops_chair_{i:02}_mesh',chair)
        seat=empty(f'ops_seat_{i:03}',group);seat.location=(11.8,y,.50);seat.rotation_euler.z=-math.pi/2
        stand=empty(f'ops_stand_{i:03}',group);stand.location=(13.0,y,0)
        seats.append({'seat':seat.name,'stand':stand.name,'position_blender_m':[11.8,y,.50],
                      'stand_blender_m':[13.0,y,0],'forward_blender':[-1,0,0]})
        collision(chair.name,(11.36,y-.43,0),(12.22,y+.43,1.23),'operator_chair')
        stations.append({'node':station.name,'operator_chair':chair.name,'faces':'-X'})

    # Closed cabinets and service bench use the solid north wall, clear of windows.
    cabinet_nodes=[]
    north_facing=Matrix(((1,0,0),(0,0,-1),(0,1,0))).to_quaternion()
    for i,(x0,x1,title) in enumerate(((10.4,11.7,'RICAMBI'),(16.8,17.9,'CAVI')),1):
        cabinet=empty(f'technical_cabinet_{i:02}',group);p=Parts()
        p.box((x0,12.15,.06),(x1,12.95,2.16),'body')
        p.box((x0+.02,12.13,.02),(x1-.02,12.92,.10),'frame')
        mid=(x0+x1)/2
        for j,(a,b) in enumerate(((x0+.035,mid-.012),(mid+.012,x1-.035)),1):
            p.box((a,12.115,.15),(b,12.148,2.10),'drawer')
            yy=12.085;xx=b-.075 if j==1 else a+.075
            p.box((xx-.012,yy,.96),(xx+.012,12.115,1.17),'frame')
            for zz in (.29,.36,1.87,1.94):
                p.box((a+.08,12.110,zz),(b-.08,12.116,zz+.012),'frame')
        p.box((mid-.28,12.108,1.56),(mid+.28,12.115,1.72),'frame')
        p.make(f'technical_cabinet_{i:02}_body',cabinet)
        label(title,f'technical_cabinet_{i:02}_label',cabinet,(mid,12.103,1.605),.075,north_facing)
        cabinet_nodes.append(cabinet.name)
        collision(cabinet.name,(x0,12.08,0),(x1,12.95,2.16),'closed_parts_cabinet')
    bench=empty('maintenance_bench',group);p=Parts()
    p.box((12.0,11.9,.88),(16.5,12.90,.96),'top')
    p.box((12.0,11.875,.88),(16.5,11.91,.94),'teal')
    for x0,x1 in ((12.08,12.68),(15.82,16.42)):
        p.box((x0,12.0,.08),(x1,12.82,.88),'body')
        for row in range(4):
            zz=.17+row*.17
            p.box((x0+.03,11.98,zz),(x1-.03,12.00,zz+.145),'drawer')
            p.box((x0+.16,11.95,zz+.09),(x1-.16,11.98,zz+.108),'frame')
    p.box((12.05,12.92,1.12),(16.45,12.97,2.22),'frame')
    for col in range(35):
        for row in range(7):
            x=12.14+col*.123;z=1.21+row*.138
            p.box((x,12.914,z),(x+.012,12.921,z+.012),'dark')
    # Tool silhouettes and parts bins on a pegboard, not additional monitoring panels.
    for i in range(8):
        x=12.35+i*.49
        p.box((x-.025,12.87,1.40),(x+.025,12.915,1.59),'orange' if i%3==0 else 'teal')
        p.box((x-.008,12.88,1.59),(x+.008,12.91,1.91),'silver')
    p.box((12.80,12.03,.961),(15.30,12.76,.974),'teal')
    for i in range(3):
        x=15.45+i*.27
        p.box((x,12.49,.96),(x+.22,12.74,1.08),'frame')
        p.box((x+.025,12.515,1.08),(x+.195,12.715,1.095),'dark')
    p.make('maintenance_bench_structure_tools',bench)
    collision(bench.name,(12,11.875,0),(16.5,12.97,2.22),'maintenance_bench_and_toolboard')

    # Open 2U server: bare tray, motherboard, memory, sinks, fan wall and drive bays.
    server=empty('maintenance_open_server',bench);server.location=(14.05,12.35,.978)
    p=Parts();p.box((-.25,-.39,0),(.25,.39,.015),'silver')
    for x0 in (-.25,.237):p.box((x0,-.39,.015),(x0+.013,.39,.10),'body')
    p.box((-.235,.374,.015),(.237,.39,.10),'silver')
    p.box((-.225,-.03,.016),(.225,.33,.024),'pcb')
    for x in (-.13,.04):
        p.box((x,.09,.024),(x+.09,.18,.045),'chip')
        for fin in range(8):p.box((x+fin*.011,.09,.045),(x+fin*.011+.005,.18,.077),'silver')
    for x in (-.20,-.175,-.15,-.125,.13,.155,.18,.205):
        p.box((x,.20,.025),(x+.008,.32,.064),'pcb')
        p.box((x-.001,.215,.035),(x+.009,.305,.052),'chip')
    for i in range(4):
        x=-.18+i*.12
        p.box((x-.049,-.14,.015),(x+.049,-.04,.088),'dark')
        p.cylinder((x,-.09),.034,.088,.092,'body',n=12)
    for d in range(8):
        x=-.225+d*.056
        p.box((x,-.39,.015),(x+.050,-.17,.087),'dark')
        p.box((x+.003,-.399,.024),(x+.047,-.390,.075),'body')
        p.box((x+.007,-.402,.03),(x+.039,-.399,.037),'silver')
    for x in (-.22,-.105):
        p.box((x,.26,.025),(x+.10,.37,.09),'silver')
        p.box((x+.015,.29,.09),(x+.085,.35,.095),'dark')
    p.make('open_server_chassis_and_components',server)
    p=Parts();p.box((14.58,12.0,.977),(15.08,12.78,.987),'silver')
    p.box((14.61,12.04,.987),(15.05,12.73,.991),'body')
    p.make('open_server_removed_lid',bench)
    p=Parts()
    p.beam((13.02,12.16,.99),(13.30,12.22,.99),.014,'silver')
    p.beam((12.91,12.135,.99),(13.04,12.163,.99),.035,'orange')
    p.beam((13.12,12.47,.99),(13.36,12.42,.99),.025,'silver')
    p.box((13.30,12.39,.98),(13.38,12.46,.995),'silver')
    p.box((13.32,12.40,.982),(13.38,12.44,1.0),'dark')
    p.box((13.36,12.57,.98),(13.53,12.68,1.02),'dark')
    p.box((13.37,12.58,1.02),(13.52,12.67,1.025),'pcb')
    p.make('maintenance_loose_tools_and_drive',bench)

    for name,pos,target,lens in [
        ('operations',(16,-10.7,3.2),(10.8,-4.4,1.0),25),
        ('maintenance',(14.0,7.3,3.2),(14.1,12.25,1.12),24)]:
        data=bpy.data.cameras.new(prefix+'preview_'+name);ob=bpy.data.objects.new(data.name,data)
        preview.objects.link(ob);ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.lens=lens;data.clip_end=150
    for i,(pos,target,power,size) in enumerate([
        ((12,-4,4.6),(10.4,-4.5,0),260,7),((14.5,10.7,3.8),(14.1,12.35,.9),180,4)]):
        data=bpy.data.lights.new(prefix+f'preview_ops_light_{i}','AREA');data.energy=power;data.size=size
        ob=bpy.data.objects.new(data.name,data);preview.objects.link(ob);ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    return {'group':group.name,'control_desk':desk.name,'workstations':stations,
            'pc_screen_nodes':screens,'seats':seats,'maintenance_bench':bench.name,
            'open_server':server.name,'closed_cabinets':cabinet_nodes,'colliders':boxes,
            'central_door_route_clear_y_m':[-1.3,1.3],
            'elevator_to_door_route_clear_x_m':[7.0,9.5],
            'monitoring_panels':'three_existing_whiteboards_inside_server_zone',
            'runtime_implemented':False}
