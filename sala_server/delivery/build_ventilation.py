"""Estrattori industriali stilizzati a soffitto; geometria originale, nessuna simulazione."""
import math
import bpy
from mathutils import Vector


def add_ventilation(scene,root,asset,preview,prefix):
    palette={'housing':(.67,.72,.75),'duct':(.47,.53,.57),
             'blade':(.24,.30,.34),'hub':(.59,.64,.67),
             'guard':(.43,.49,.52),'fastener':(.20,.24,.27)}
    materials=[]
    for name,rgb in palette.items():
        m=bpy.data.materials.new(prefix+'vent_mat_'+name);m.use_nodes=True
        m.diffuse_color=(*rgb,1)
        sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
        sh.inputs['Base Color'].default_value=(*map(linear,rgb),1)
        sh.inputs['Metallic'].default_value=.45
        sh.inputs['Roughness'].default_value=.55
        materials.append(m)
    names=list(palette)

    class Parts:
        def __init__(self):self.v=[];self.f=[];self.ids=[]
        def add(self,verts,faces,mat):
            off=len(self.v);self.v.extend(verts)
            self.f.extend(tuple(off+i for i in f) for f in faces)
            self.ids.extend([names.index(mat)]*len(faces))
        def box(self,lo,hi,mat):
            self.add([(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])],
                     [(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)],mat)
        def ring(self,inner,outer,z0,z1,mat,square=False,n=64):
            v=[]
            for z in (z0,z1):
                for r in (inner,outer):
                    for i in range(n):
                        a=i*math.tau/n;c,s=math.cos(a),math.sin(a)
                        scale=r/max(abs(c),abs(s)) if square and r==outer else r
                        v.append((scale*c,scale*s,z))
            f=[]
            for i in range(n):
                j=(i+1)%n
                f += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),
                      (i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
            self.add(v,f,mat)
        def cylinder(self,r,z0,z1,mat,n=48):
            v=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),z) for z in (z0,z1) for i in range(n)]
            f=[tuple(reversed(range(n))),tuple(range(n,2*n))]
            f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
            self.add(v,f,mat)
        def beam(self,a,b,width,mat):
            d=Vector(b)-Vector(a);q=d.to_track_quat('Z','Y');center=(Vector(a)+Vector(b))/2
            v=[tuple(center+q@Vector((x,y,z))) for z in (-d.length/2,d.length/2)
               for y in (-width/2,width/2) for x in (-width/2,width/2)]
            self.add(v,[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)],mat)
        def mesh(self,label):
            me=bpy.data.meshes.new(prefix+label+'_mesh');me.from_pydata(self.v,[],self.f);me.update()
            used=sorted(set(self.ids))
            for idx in used:me.materials.append(materials[idx])
            for p,idx in zip(me.polygons,self.ids):p.material_index=used.index(idx)
            return me

    housing=Parts()
    # Square mounting flange with a real open circular throat, no solid cap.
    housing.ring(.82,1.05,.075,.15,'housing',square=True)
    housing.ring(.82,.875,.15,.65,'duct')
    housing.ring(.805,.89,.05,.085,'guard')
    for x in (-.94,.94):
        for y in (-.94,.94):
            housing.box((x-.026,y-.026,.035),(x+.026,y+.026,.075),'fastener')
    for angle in range(4):
        a=angle*math.pi/2
        housing.beam((.15*math.cos(a),.15*math.sin(a),.43),
                     (.81*math.cos(a),.81*math.sin(a),.43),.035,'hub')
    housing.cylinder(.14,.30,.51,'hub')
    housing.cylinder(.045,.19,.32,'fastener')
    housing_data=housing.mesh('extractor_housing')

    rotor=Parts()
    # Eight swept blades, with a shallow pitch and actual solid thickness.
    for i in range(8):
        angle=i*math.tau/8
        outline=[(.13,-.055),(.36,-.13),(.70,-.12),(.78,.015),(.69,.16),(.34,.09)]
        verts=[]
        for layer in (0,.022):
            for x,y in outline:
                z=.19+y*.32+layer
                verts.append((x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),z))
        n=len(outline)
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        rotor.add(verts,faces,'blade')
    rotor.cylinder(.16,.135,.255,'hub')
    rotor.cylinder(.065,.12,.14,'fastener')
    rotor_data=rotor.mesh('extractor_rotor')

    guard=Parts()
    for radius in (.25,.48,.70,.80):guard.ring(radius-.008,radius+.008,0,.018,'guard',n=64)
    for i in range(8):
        a=i*math.tau/8
        guard.beam((0,0,.009),(.80*math.cos(a),.80*math.sin(a),.009),.014,'guard')
    guard_data=guard.mesh('extractor_guard')

    group=bpy.data.objects.new(prefix+'ventilation',None);asset.objects.link(group);group.parent=root
    modules=[]
    for row,y in enumerate((-8.5,-1.,6.5),1):
        for column,x in enumerate((-10.,-1.),1):
            label=f'extractor_{row:02}_{column:02}'
            ob=bpy.data.objects.new(prefix+label,None);asset.objects.link(ob);ob.parent=group
            ob.location=(x,y,4.55);ob.empty_display_size=.10
            nodes={}
            for part,data in [('housing',housing_data),('rotor',rotor_data),('guard',guard_data)]:
                child=bpy.data.objects.new(prefix+label+'_'+part,data)
                asset.objects.link(child);child.parent=ob;nodes[part]=child.name
            scene.objects[nodes['rotor']]['role']='extractor_rotor_8_blades'
            modules.append({'id':label,'node':ob.name,'row':row,'position_blender_m':[x,y,4.55],
                'nodes':nodes,'rotor_diameter_m':1.6,'flange_size_m':[2.1,2.1],
                'bottom_z_m':4.55,'ceiling_connection_z_m':5.2,
                'airflow_visual_direction':'+Z','simulation':'not_implemented'})
    data=bpy.data.cameras.new(prefix+'preview_ventilation')
    camera=bpy.data.objects.new(data.name,data);preview.objects.link(camera)
    camera.location=(-7.5,-4.7,3.45)
    camera.rotation_euler=(Vector((-10,-1,4.83))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.lens=28;data.clip_end=150
    return {'modules':modules,'palette_srgb':palette,'count':6,
            'type':'ceiling_industrial_axial_extractors','rotor_diameter_m':1.6,
            'mounting':'flush_to_ceiling_at_z_5.2','animated':False,
            'engineering_sizing':'not_performed_visual_model_only'}
