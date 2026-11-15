"""Agent Office Palace: prima bozza di Juri, 13 posti, contratto 1.0.0.

Uso: blender --background --python build_scene.py
Salva in work/ per default; -- --output-dir <cartella nuova> cambia destinazione.
Non cancella scene/oggetti esistenti. Nessuna risorsa o dipendenza esterna.
"""
from pathlib import Path
import argparse
import json
import math
import sys
import bpy
from mathutils import Vector

KIT = Path(__file__).resolve().parent.parent
HEIGHT = 5.2  # Proposta visiva v01 da rivedere con Juri.
SCENE_NAME = 'AOP_Sala_Riunioni_v01'
LAYOUT_CENTER_X = (-18.0 + 7.2) / 2.0


def enum(owner, prop, preferred):
    values = [x.identifier for x in owner.bl_rna.properties[prop].enum_items]
    # Alcuni enum dinamici (unita, view transform) sono incompleti nell'RNA statico.
    try:
        setattr(owner, prop, preferred)
    except TypeError as exc:
        raise RuntimeError(f'{prop}: {preferred}; RNA={values}; {exc}') from exc


def linear(x):
    return x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4


def center_meeting_zone(scene, manifest=None):
    """Centro del tratto di parete libero: muro ovest -18 -> ascensore 7.2."""
    previous=float(scene.get('aop_layout_center_x',0.0))
    dx=LAYOUT_CENTER_X-previous
    bpy.data.objects['furniture'].location.x+=dx
    bpy.data.objects['anchors'].location.x+=dx
    movable_colliders=('col_table','col_chair_','col_whiteboard','col_plant_')
    for ob in scene.objects:
        if ob.name.startswith(('pendant_',)+movable_colliders):
            ob.location.x+=dx
        elif ob.name in ('preview_camera_entrance','preview_camera_whiteboard_from_seat',
                          'preview_table_light','preview_north_light','preview_south_light'):
            ob.location.x+=dx
    if manifest is not None:
        for seat in manifest['seats']:
            seat['position_blender_m'][0]+=dx
            seat['stand_blender_m'][0]+=dx
        for row in manifest['colliders']:
            if row['id'].startswith(movable_colliders):
                row['min_blender_m'][0]+=dx;row['max_blender_m'][0]+=dx
        manifest['layout_alignment']={'reference':'muro ovest -> bordo ovest ascensore',
                                      'span_x_m':[-18,7.2],'center_x_m':LAYOUT_CENTER_X}
    scene['aop_layout_center_x']=LAYOUT_CENTER_X
    bpy.context.view_layer.update()
    return dx


def fill_board_wall(scene):
    """Pannelli alternati lungo tutta la parete a ovest del vano ascensore."""
    for ob in list(scene.objects):
        if ob.name.startswith('north_acoustic_panel_'):
            data=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
            if data.users==0:bpy.data.meshes.remove(data)
    parent=bpy.data.objects['architecture'];col=parent.users_collection[0]
    x0,x1=-18.0,7.2;n=14;step=(x1-x0)/n
    for i in range(n):
        lo=(x0+i*step+.065,12.93,.20);hi=(x0+(i+1)*step-.065,13.005,5.0)
        verts=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        faces=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]
        me=bpy.data.meshes.new(f'north_acoustic_panel_{i:02}_mesh');me.from_pydata(verts,[],faces);me.update()
        me.materials.append(bpy.data.materials['mat_wall_cream' if i%2 else 'mat_wood_warm'])
        ob=bpy.data.objects.new(f'north_acoustic_panel_{i:02}',me);col.objects.link(ob);ob.parent=parent
    return n


def add_glass_partition(scene):
    """Vetrata richiesta sulla giunzione fra secondo e terzo pannello da destra."""
    if 'meeting_door_pivot' in bpy.data.objects:raise RuntimeError('Vetrata gia presente')
    arch=bpy.data.objects['architecture'];col=arch.users_collection[0]
    helpers=bpy.data.collections['AOP_Collider_NON_ESPORTARE']
    glass=bpy.data.materials.get('mat_partition_glass')
    if glass is None:
        glass=bpy.data.materials.new('mat_partition_glass');glass.use_nodes=True
        glass.diffuse_color=(.55,.76,.79,.18);glass.use_backface_culling=False
        sh=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        sh.inputs['Base Color'].default_value=(*[linear(v) for v in (.55,.76,.79)],1)
        sh.inputs['Roughness'].default_value=.18;sh.inputs['Alpha'].default_value=.18
        if hasattr(glass,'surface_render_method'):
            options=[v.identifier for v in glass.bl_rna.properties['surface_render_method'].enum_items]
            if 'DITHERED' in options:enum(glass,'surface_render_method','DITHERED')
    def make(name,verts,faces,mat,parent=arch,loc=(0,0,0)):
        me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,[],faces);me.materials.append(mat);me.update()
        ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=parent;ob.location=loc
        return ob
    def cube(name,lo,hi,parent=arch,mat=None):
        v=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        return make(name,v,[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)],
                    mat or bpy.data.materials['mat_frame_slate'],parent)
    rows=[];fixed=[];x=3.6
    def collider(name,lo,hi,role):
        ob=cube('col_'+name,lo,hi,parent=None)
        for c in list(ob.users_collection):c.objects.unlink(ob)
        helpers.objects.link(ob);ob.hide_render=True;ob.hide_set(True)
        row={'id':ob.name,'min_blender_m':list(lo),'max_blender_m':list(hi),'role':role}
        if role=='door_closed':row['active_when']='door_closed'
        rows.append(row)
    for side,a,b in [('south',-13,-.95),('north',.95,13)]:
        for i in range(5):
            ya=a+(b-a)*i/5;yb=a+(b-a)*(i+1)/5
            g=make(f'partition_glass_{side}_{i}',[(x,ya+.035,.12),(x,yb-.035,.12),
                   (x,yb-.035,5.08),(x,ya+.035,5.08)],[(0,1,2,3)],glass)
            fixed.append(g.name)
            for suffix,lo,hi in [('post',(x-.055,ya-.035,0),(x+.055,ya+.035,5.2)),
                                  ('base',(x-.055,ya,.035),(x+.055,yb,.12)),
                                  ('top',(x-.055,ya,5.08),(x+.055,yb,5.2))]:
                fixed.append(cube(f'partition_{side}_{i}_{suffix}',lo,hi).name)
        collider('partition_'+side,(x-.06,a,0),(x+.06,b,5.2),'partition')
    for suffix,y in [('south',-.95),('north',.95)]:
        fixed.append(cube('meeting_door_jamb_'+suffix,(x-.08,y-.05,0),(x+.08,y+.05,5.2)).name)
    fixed.append(cube('meeting_door_header',(x-.08,-.95,2.60),(x+.08,.95,2.70)).name)
    fixed.append(cube('meeting_door_transom_top',(x-.055,-.95,5.08),(x+.055,.95,5.2)).name)
    fixed.append(make('meeting_door_transom_glass',[(x,-.90,2.7),(x,.90,2.7),(x,.90,5.08),(x,-.90,5.08)],[(0,1,2,3)],glass).name)
    collider('door_transom',(x-.08,-.95,2.6),(x+.08,.95,5.2),'partition')
    pivot=bpy.data.objects.new('meeting_door_pivot',None);col.objects.link(pivot);pivot.parent=arch
    pivot.location=(x,-.90,0);pivot['interaction']='hinged_door';pivot['closed_angle_z']=0;pivot['open_angle_z']=math.pi/2
    make('meeting_door_glass',[(0,.055,.10),(0,1.745,.10),(0,1.745,2.51),(0,.055,2.51)],[(0,1,2,3)],glass,pivot)
    for suffix,lo,hi in [('hinge',(-.035,0,.035),(.035,.055,2.565)),
                         ('latch',(-.035,1.745,.035),(.035,1.8,2.565)),
                         ('bottom',(-.035,0,.035),(.035,1.8,.10)),
                         ('top',(-.035,0,2.51),(.035,1.8,2.565))]:
        cube('meeting_door_leaf_'+suffix,lo,hi,pivot)
    for suffix,xx in [('inside',-.12),('outside',.12)]:
        cube('meeting_door_handle_'+suffix,(xx-.025,1.43,1.13),(xx+.025,1.69,1.20),pivot,bpy.data.materials['mat_accent_gold'])
    collider('meeting_door',(x-.04,-.90,.035),(x+.04,.90,2.565),'door_closed')
    return {'wall_nodes':fixed,'colliders':rows,
            'partition':{'axis_x_m':x,'span_y_m':[-13,13],'glass_material':glass.name,
                         'door_pivot':'meeting_door_pivot','door_surface':'meeting_door_glass',
                         'door_center_blender_m':[x,0,0],'door_clear_width_m':1.8,'door_clear_height_m':2.6,
                         'preview_state':'closed','runtime_open_close':'not_implemented_in_asset_task'}}


def add_plants(scene):
    """Due piante richieste da Juri ai lati della lavagna; utilizzabile anche live."""
    if 'plant_left' in bpy.data.objects or 'plant_right' in bpy.data.objects:
        raise RuntimeError('Piante gia presenti: non duplicate')
    parent=bpy.data.objects['furniture']
    col=parent.users_collection[0]
    helper=bpy.data.collections['AOP_Collider_NON_ESPORTARE']
    colors={'mat_plant_terracotta':(.75,.29,.14),'mat_plant_rim':(.92,.42,.21),
            'mat_plant_soil':(.25,.18,.12),'mat_plant_stem':(.25,.40,.19),
            'mat_leaf_green':(.29,.58,.25),'mat_leaf_light':(.46,.70,.32)}
    materials=[]
    for name,rgb in colors.items():
        m=bpy.data.materials.get(name)
        if m is None:
            m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
            node=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            node.inputs['Base Color'].default_value=(*[linear(v) for v in rgb],1)
            node.inputs['Roughness'].default_value=.85
        materials.append(m)
    result=[]
    for side,x,phase in [('left',-5.6,0),('right',5.6,.45)]:
        verts=[];faces=[];ids=[]
        def frustum(z0,z1,r0,r1,mid):
            start=len(verts);n=12
            for z,r in [(z0,r0),(z1,r1)]:
                verts.extend([(r*math.cos(i*2*math.pi/n),r*math.sin(i*2*math.pi/n),z) for i in range(n)])
            faces.append(tuple(start+i for i in reversed(range(n))));ids.append(mid)
            for i in range(n):
                j=(i+1)%n;faces.append((start+i,start+j,start+n+j,start+n+i));ids.append(mid)
            faces.append(tuple(start+n+i for i in range(n)));ids.append(mid)
        frustum(.025,.83,.39,.55,0)
        frustum(.78,.91,.59,.59,1)
        frustum(.905,.916,.51,.51,2)
        frustum(.91,2.58,.055,.022,3)
        for i in range(15):
            a=i*2.399963+phase
            z=1.03+(i%5)*.30
            d=Vector((math.cos(a),math.sin(a),0))
            tangent=Vector((-d.y,d.x,0))
            base=Vector((0,0,z));tip=d*(.67+.06*(i%3))+Vector((0,0,z+.65))
            middle=(base+tip)*.5
            pts=[base,middle+tangent*.18,tip,middle-tangent*.18,middle+Vector((0,0,.10))]
            offset=len(verts);verts.extend([tuple(p) for p in pts])
            for q,mi in [((0,1,4),4),((1,2,4),5),((2,3,4),4),((3,0,4),5)]:
                faces.append(tuple(offset+k for k in q));ids.append(mi)
        data=bpy.data.meshes.new('plant_'+side+'_mesh');data.from_pydata(verts,[],faces);data.update()
        for m in materials:data.materials.append(m)
        for p,idx in zip(data.polygons,ids):p.material_index=idx
        ob=bpy.data.objects.new('plant_'+side,data);col.objects.link(ob);ob.parent=parent;ob.location=(x,11.65,0)
        # Foglie a due facce per conservare lo stile low-poly visto da entrambi i lati.
        for m in materials[4:]:m.use_backface_culling=False
        lo=(x-.88,10.77,0);hi=(x+.88,12.53,2.9)
        cv=[(xx,yy,zz) for zz in (lo[2],hi[2]) for yy in (lo[1],hi[1]) for xx in (lo[0],hi[0])]
        edges=[(0,1),(1,3),(3,2),(2,0),(4,5),(5,7),(7,6),(6,4),(0,4),(1,5),(2,6),(3,7)]
        cm=bpy.data.meshes.new('col_plant_'+side+'_mesh');cm.from_pydata(cv,edges,[])
        co=bpy.data.objects.new('col_plant_'+side,cm);helper.objects.link(co);co.hide_render=True;co.hide_set(True)
        result.append({'id':co.name,'min_blender_m':list(lo),'max_blender_m':list(hi),'role':'plant'})
    return result


def add_south_windows(scene):
    """Finestre nel muro lungo opposto ascensore, uguali ai lati corti."""
    if 'wall_south_base' in bpy.data.objects:raise RuntimeError('Finestre sud gia presenti')
    for ob in scene.objects:
        if ob.type=='MESH' and ob.name.startswith('window_west_'):
            ob.data.materials.clear();ob.data.materials.append(bpy.data.materials['mat_glass_blue'])
    for name in ('wall_south','col_wall_south'):
        ob=bpy.data.objects.get(name)
        if ob:
            data=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
            if data.users==0:bpy.data.meshes.remove(data)
    arch=bpy.data.objects['architecture'];col=arch.users_collection[0]
    helpers=bpy.data.collections['AOP_Collider_NON_ESPORTARE'];nodes=[];rows=[]
    def cube(name,lo,hi,mat,collision=True):
        v=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        f=[(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]
        me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(v,[],f);me.materials.append(bpy.data.materials[mat]);me.update()
        ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=arch
        if collision:
            nodes.append(ob.name)
            cm=bpy.data.meshes.new('col_'+name+'_mesh');cm.from_pydata(v,[],f)
            co=bpy.data.objects.new('col_'+name,cm);helpers.objects.link(co);co.hide_render=True;co.hide_set(True)
            rows.append({'id':co.name,'min_blender_m':list(lo),'max_blender_m':list(hi),'role':'wall'})
    cube('wall_south_base',(-18.3,-13.3,0),(18.3,-13.02,1.05),'mat_wall_sand')
    cube('wall_south_header',(-18.3,-13.3,4.55),(18.3,-13.02,5.2),'mat_wall_cream')
    for i in range(8):
        a=-18.3+i*4.575;b=-18.3+(i+1)*4.575
        cube(f'wall_south_pier_{i}',(a,-13.3,1.05),(a+.3,-13.02,4.55),'mat_wall_cream')
        cube(f'window_south_{i}',(a+.3,-13.3,1.05),(b,-13.02,4.55),'mat_glass_blue')
        mid=(a+.3+b)/2
        cube(f'window_mullion_south_{i}',(mid-.03,-13.03,1.05),(mid+.03,-12.98,4.55),'mat_frame_slate',False)
        cube(f'window_reflection_south_{i}',(a+.53,-13.035,1.2),(a+.63,-12.975,4.4),'mat_glass_reflection',False)
    return {'wall_nodes':nodes,'colliders':rows}


def add_lounge(scene):
    """Zona attesa esterna: due divanetti, due poltrone, tavolini, piante e luci."""
    if 'lounge_furniture' in bpy.data.objects:raise RuntimeError('Lounge gia presente')
    def group(name,parent):
        ob=bpy.data.objects.new(name,None);parent.users_collection[0].objects.link(ob);ob.parent=parent
        ob.location=-parent.matrix_world.translation
        return ob
    furniture=group('lounge_furniture',bpy.data.objects['furniture'])
    anchors=group('lounge_anchors',bpy.data.objects['anchors'])
    arch=bpy.data.objects['architecture'];col=furniture.users_collection[0]
    helper=bpy.data.collections['AOP_Collider_NON_ESPORTARE']
    rows=[];seats=[];nodes=[]
    def mat(name,rgb):
        m=bpy.data.materials.get(name)
        if m is None:
            m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb,1)
            sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
            sh.inputs['Base Color'].default_value=(*[linear(v) for v in rgb],1);sh.inputs['Roughness'].default_value=.9
        return m
    mat('mat_lounge_rug_teal',(.34,.55,.54));mat('mat_lounge_rug_sand',(.77,.62,.44))
    mat('mat_lounge_cushion_cream',(.94,.84,.63))
    def parts_obj(name,parts,materials,pos=(0,0,0),angle=0,parent=furniture,bevel=.045):
        verts=[];faces=[];ids=[]
        for center,size,mid in parts:
            offset=len(verts);x,y,z=center;dx,dy,dz=[s/2 for s in size]
            verts.extend([(x-dx,y-dy,z-dz),(x+dx,y-dy,z-dz),(x+dx,y+dy,z-dz),(x-dx,y+dy,z-dz),
                          (x-dx,y-dy,z+dz),(x+dx,y-dy,z+dz),(x+dx,y+dy,z+dz),(x-dx,y+dy,z+dz)])
            faces.extend([tuple(offset+i for i in q) for q in ((0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7))]);ids.extend([mid]*6)
        me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,[],faces);me.update()
        for n in materials:me.materials.append(bpy.data.materials[n])
        for p,i in zip(me.polygons,ids):p.material_index=i
        ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=parent;ob.location=pos;ob.rotation_euler.z=angle
        if bevel:
            kinds=[v.identifier for v in bpy.types.Modifier.bl_rna.properties['type'].enum_items]
            if 'BEVEL' in kinds:
                b=ob.modifiers.new('Bordi_lounge_low_poly','BEVEL');b.width=bevel;b.segments=1
        nodes.append(ob.name)
        return ob
    def add_collider(name,lo,hi,role):
        v=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        me=bpy.data.meshes.new('col_'+name+'_mesh');me.from_pydata(v,[(0,1),(1,3),(3,2),(2,0),(4,5),(5,7),(7,6),(6,4),(0,4),(1,5),(2,6),(3,7)],[])
        ob=bpy.data.objects.new('col_'+name,me);helper.objects.link(ob);ob.hide_render=True;ob.hide_set(True)
        rows.append({'id':ob.name,'min_blender_m':list(lo),'max_blender_m':list(hi),'role':role})
    def bounds(ob):
        bpy.context.view_layer.update();pts=[ob.matrix_world@Vector(p) for p in ob.bound_box]
        return tuple(min(p[k] for p in pts) for k in range(3)),tuple(max(p[k] for p in pts) for k in range(3))
    def anchor(number,pos,angle,stand,chair):
        for prefix,point in [('seat_',pos),('stand_',stand)]:
            ob=bpy.data.objects.new(prefix+f'{number:03}',None);col.objects.link(ob);ob.parent=anchors;ob.location=point;ob.rotation_euler.z=angle
        seats.append({'anchor':f'seat_{number:03}','stand':f'stand_{number:03}','allowed_occupants':['person','agent'],
                      'position_blender_m':list(pos),'stand_blender_m':list(stand),
                      'facing_blender':[math.sin(angle),-math.cos(angle),0],'role':'lounge','chair_node':chair})
    def sofa(name,pos,angle,color,first,count=2,side_stand=None):
        width=2.85 if count==2 else 1.23
        p=[((0,0,.32),(width,1.10,.25),1),((0,.47,.82),(width,.22,.80),0),
           ((-width/2+.10,0,.65),(.20,1.18,.57),0),((width/2-.10,0,.65),(.20,1.18,.57),0)]
        for k in range(count):
            xx=(k-(count-1)/2)*(1.27 if count==2 else 0)
            p.append(((xx,-.03,.53),(1.21 if count==2 else .83,.88,.22),0))
            p.append(((xx,.31,.88),(1.16 if count==2 else .8,.20,.56),0))
            if k==0:p.append(((xx,-.02,.79),(.40,.20,.36),2))
        for xx in (-width/2+.24,width/2-.24):
            for yy in (-.35,.35):p.append(((xx,yy,.105),(.12,.12,.21),1))
        ob=parts_obj(name,p,[color,'mat_wood_edge','mat_lounge_cushion_cream'],pos,angle)
        lo,hi=bounds(ob);add_collider(name,lo,hi,'lounge_seating')
        co,si=math.cos(angle),math.sin(angle)
        def world(local):return (pos[0]+co*local[0]-si*local[1],pos[1]+si*local[0]+co*local[1],local[2])
        for k in range(count):
            xx=(k-(count-1)/2)*1.27
            st=side_stand if side_stand is not None else world((xx,-1.35,0))
            anchor(first+k,world((xx,-.03,.64)),angle,st,name)
    # Due isole morbide, percorso principale libero verso ascensore e porta.
    parts_obj('lounge_rug_south',[((12.7,-6.9,.012),(8.6,7.5,.024),0)],['mat_lounge_rug_teal'],bevel=0)
    parts_obj('lounge_rug_north',[((14.0,5.6,.012),(7.1,5.8,.024),0)],['mat_lounge_rug_sand'],bevel=0)
    sofa('lounge_sofa_teal',(11.7,-9,0),math.pi,'mat_upholstery_teal',14)
    sofa('lounge_sofa_orange',(15.2,-6.25,0),-math.pi/2,'mat_upholstery_orange',16)
    sofa('lounge_armchair_mauve',(12,5.6,0),math.pi/2,'mat_upholstery_mauve',18,1,(12,7.1,0))
    sofa('lounge_armchair_teal',(16,5.6,0),-math.pi/2,'mat_upholstery_teal',19,1,(16,4.1,0))
    def round_table(name,pos,radius,height):
        verts=[];faces=[];n=20
        for z in (height-.08,height):
            verts.extend([(radius*math.cos(i*2*math.pi/n),radius*math.sin(i*2*math.pi/n),z) for i in range(n)])
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
        faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
        me=bpy.data.meshes.new(name+'_top_mesh');me.from_pydata(verts,[],faces);me.materials.append(bpy.data.materials['mat_wood_light']);me.update()
        ob=bpy.data.objects.new(name+'_top',me);col.objects.link(ob);ob.parent=furniture;ob.location=pos;nodes.append(ob.name)
        p=[]
        for a in (0,2*math.pi/3,4*math.pi/3):
            p.append(((radius*.52*math.cos(a),radius*.52*math.sin(a),(height-.08)/2),(.09,.09,height-.08),0))
        parts_obj(name+'_legs',p,['mat_frame_slate'],pos,bevel=.018)
        add_collider(name,(pos[0]-radius,pos[1]-radius,0),(pos[0]+radius,pos[1]+radius,height),'lounge_table')
    round_table('lounge_coffee_table',(11.7,-6.25,0),.95,.46)
    round_table('lounge_conversation_table',(14.0,5.6,0),.68,.52)
    round_table('lounge_side_table',(9.5,-8.7,0),.42,.62)
    # Consolle e libri geometrici, senza funzione bar o bevande.
    parts_obj('lounge_console',[((17.25,0,.70),(.55,3.1,1.05),0),((17.25,0,1.27),(.64,3.2,.10),1)],['mat_upholstery_teal','mat_wood_light'])
    add_collider('lounge_console',(16.93,-1.6,.1),(17.57,1.6,1.32),'lounge_storage')
    for i,color in enumerate(['mat_upholstery_orange','mat_upholstery_mauve','mat_accent_gold']):
        parts_obj(f'lounge_book_stack_{i}',[((17.25,-.7+i*.6,1.36),(.30,.37,.07),0)], [color],bevel=.008)
    # Riutilizzo della geometria delle piante originali, con posizioni autonome.
    for i,pos in enumerate([(6.1,-11.2,0),(16.7,-11.1,0),(16.8,10.6,0),(12.0,10.5,0)]):
        ob=bpy.data.objects.new(f'lounge_plant_{i:02}',bpy.data.objects['plant_left'].data.copy());col.objects.link(ob);ob.parent=furniture;ob.location=pos;nodes.append(ob.name)
        add_collider(ob.name,(pos[0]-.88,pos[1]-.88,0),(pos[0]+.88,pos[1]+.88,2.9),'lounge_plant')
    # Lampade a soffitto esportabili; luci di anteprima restano fuori dal root.
    for i,(x,y) in enumerate([(11.7,-6.25),(14,5.6),(6.1,4.8),(6.1,-4.8)]):
        parts_obj(f'lounge_pendant_cable_{i}',[((x,y,4.7),(.025,.025,1.0),0)],['mat_ink'],parent=arch,bevel=0)
        p=[((x,y,4.16),(1.2,.9,.16),0),((x,y,4.065),(1.05,.75,.035),1)]
        parts_obj(f'lounge_pendant_shade_{i}',p,['mat_accent_gold','mat_lamp_glow'],parent=arch,bevel=.055)
    preview=bpy.data.collections['AOP_Anteprima_NON_ESPORTARE']
    for i,(x,y) in enumerate([(11.7,-6.25),(14,5.6)]):
        data=bpy.data.lights.new(f'preview_lounge_light_{i}','AREA');data.energy=300;data.size=6
        ob=bpy.data.objects.new(data.name,data);preview.objects.link(ob);ob.location=(x,y,4.6)
    for name,pos,target,lens in [('preview_camera_lounge',(6.0,-11.4,3.8),(12.5,2.3,1.2),23),
                                  ('preview_camera_lounge_detail',(6.5,-.5,2.5),(12,-6.8,1),26)]:
        data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=150
        ob=bpy.data.objects.new(name,data);preview.objects.link(ob);ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()
    return {'seats':seats,'colliders':rows,'nodes':nodes,
            'notes':['Lounge esterna autorizzata da Juri: 2 divanetti biposto, 2 poltrone, 3 tavolini, 4 piante, consolle e 4 sospensioni.',
                     '13 posti riunione invariati; 6 posti lounge aggiuntivi distinti per role=lounge.',
                     'Percorso principale fra ascensore e porta della sala lasciato libero.']}


def match_meeting_pendants_to_lounge(scene):
    """Stesso modello geometrico quadrato usato nella lounge, richiesto da Juri."""
    source_shade=bpy.data.objects['lounge_pendant_shade_0']
    source_cable=bpy.data.objects['lounge_pendant_cable_0']
    arch=bpy.data.objects['architecture'];col=arch.users_collection[0]
    center=float(scene.get('aop_layout_center_x',LAYOUT_CENTER_X))
    created=[]
    for i,y in enumerate([-5.5,-1.7,2.1,5.9]):
        for prefix in ('pendant_shade_','pendant_diffuser_','pendant_cable_'):
            ob=bpy.data.objects.get(prefix+str(i))
            if ob:
                data=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
                if data.users==0:bpy.data.meshes.remove(data)
        for prefix,source in [('pendant_shade_',source_shade),('pendant_cable_',source_cable)]:
            ob=source.copy();ob.data=source.data;ob.name=prefix+str(i);col.objects.link(ob);ob.parent=arch
            ob.location=(center-11.7,y-(-6.25),0)
            created.append(ob.name)
    bpy.context.view_layer.update()
    return created


def build(output):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    target = output / 'conference_room.blend'
    if target.exists() or SCENE_NAME in bpy.data.scenes or 'aop_conference_room' in bpy.data.objects:
        raise RuntimeError('Destinazione/scena gia presente: scegliere una nuova destinazione e un file Blender dedicato.')
    scene = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    enum(scene.unit_settings, 'system', 'METRIC')
    scene.unit_settings.scale_length = 1
    enum(scene.unit_settings, 'length_unit', 'METERS')
    visible = bpy.data.collections.new('AOP_Asset')
    guides = bpy.data.collections.new('AOP_Guide_NON_ESPORTARE')
    collisions = bpy.data.collections.new('AOP_Collider_NON_ESPORTARE')
    preview = bpy.data.collections.new('AOP_Anteprima_NON_ESPORTARE')
    for col in (visible, guides, collisions, preview):
        scene.collection.children.link(col)
    guides.hide_render = collisions.hide_render = True
    mats = {}
    def material(name, rgb, rough=.78, metal=0, emission=0):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        color = (*[linear(v) for v in rgb], 1)
        shader.inputs['Base Color'].default_value = color
        shader.inputs['Roughness'].default_value = rough
        shader.inputs['Metallic'].default_value = metal
        if emission:
            shader.inputs['Emission Color'].default_value = color
            shader.inputs['Emission Strength'].default_value = emission
        mats[name] = mat
        return mat
    palette = {
        'mat_wall_sand': (.86, .69, .49), 'mat_wall_cream': (.94, .85, .68),
        'mat_wood_honey': (.87, .62, .34), 'mat_wood_light': (.94, .73, .44),
        'mat_wood_warm': (.89, .66, .38), 'mat_wood_edge': (.67, .43, .24),
        'mat_ink': (.17, .23, .25), 'mat_frame_slate': (.40, .47, .46),
        'mat_upholstery_teal': (.23, .62, .63), 'mat_upholstery_orange': (.94, .40, .20),
        'mat_upholstery_mauve': (.67, .44, .62), 'mat_accent_gold': (1, .69, .17),
        'mat_glass_blue': (.27, .39, .48), 'mat_glass_reflection': (.47, .61, .66),
        'mat_ceiling': (.91, .86, .73), 'mat_whiteboard_dynamic': (.98, .98, .93),
        'mat_screen': (.19, .36, .42), 'mat_screen_detail': (.43, .78, .75),
        'mat_keycaps': (.60, .66, .63), 'mat_lamp_glow': (1, .91, .64),
    }
    for n, rgb in palette.items():
        material(n, rgb, emission=.35 if n == 'mat_screen' else (1.5 if n == 'mat_lamp_glow' else 0))
    def empty(name, parent=None, loc=(0, 0, 0), col=visible):
        ob = bpy.data.objects.new(name, None)
        col.objects.link(ob)
        ob.location = loc
        ob.parent = parent
        enum(ob, 'empty_display_type', 'PLAIN_AXES')
        ob.empty_display_size = .3
        return ob
    root = empty('aop_conference_room')
    root['aop_asset_contract'] = '1.0.0'
    root['design_stage'] = 'v01_visual_review_pending'
    arch, furniture, anchors = [empty(n, root) for n in ('architecture', 'furniture', 'anchors')]
    def mesh(name, verts, faces, parent, mat_names, ids=None, loc=(0, 0, 0), rot=0, col=visible, bevel=0):
        data = bpy.data.meshes.new(name + '_mesh')
        data.from_pydata(verts, [], faces)
        data.update()
        for n in mat_names:
            data.materials.append(mats[n])
        if ids:
            for poly, idx in zip(data.polygons, ids):
                poly.material_index = idx
        ob = bpy.data.objects.new(name, data)
        col.objects.link(ob)
        ob.parent = parent
        ob.location = loc
        ob.rotation_euler.z = rot
        if bevel:
            # Tipo controllato nell'RNA della versione Blender effettiva.
            kinds = [v.identifier for v in bpy.types.Modifier.bl_rna.properties['type'].enum_items]
            if 'BEVEL' not in kinds:
                raise RuntimeError('Modificatore bevel non disponibile')
            mod = ob.modifiers.new('Bordi_low_poly', 'BEVEL')
            mod.width = bevel
            mod.segments = 1
        return ob
    def part_box(parts, center, size, material_id=0):
        v, f, ids = parts
        a = len(v)
        x, y, z = center
        dx, dy, dz = [s / 2 for s in size]
        v.extend([(x-dx,y-dy,z-dz),(x+dx,y-dy,z-dz),(x+dx,y+dy,z-dz),(x-dx,y+dy,z-dz),
                  (x-dx,y-dy,z+dz),(x+dx,y-dy,z+dz),(x+dx,y+dy,z+dz),(x-dx,y+dy,z+dz)])
        f.extend([tuple(a+i for i in q) for q in ((0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7))])
        ids.extend([material_id] * 6)
    def box(name, lo, hi, mat, parent=arch, bevel=0):
        p = ([], [], [])
        part_box(p, tuple((a+b)/2 for a,b in zip(lo,hi)), tuple(b-a for a,b in zip(lo,hi)))
        return mesh(name, p[0], p[1], parent, [mat], p[2], bevel=bevel)
    collider_rows = []
    def collider(name, lo, hi, role):
        ob = box('col_' + name, lo, hi, 'mat_ink', parent=None)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        collisions.objects.link(ob)
        enum(ob, 'display_type', 'WIRE')
        ob.hide_render = True
        collider_rows.append({'id': ob.name, 'min_blender_m': list(lo), 'max_blender_m': list(hi), 'role': role})
    floors, walls, ceilings = [], [], []
    # Tre zone con intaglio totale per il vano ascensore, incluso il soffitto.
    zones = [('main', -18.3, 18.3, -13.3, 10.6), ('north_west', -18.3, 7.2, 10.6, 13.3),
             ('north_east', 9.8, 18.3, 10.6, 13.3)]
    for name, x0, x1, y0, y1 in zones:
        p = ([], [], [])
        part_box(p, ((x0+x1)/2, (y0+y1)/2, -.11), (x1-x0,y1-y0,.18), 3)
        x = x0; stripe = 0
        while x < x1 - .001:
            nx = min(x + .9, x1)
            y = y0; piece = 0
            first = 2.3 if stripe % 2 else 4.6
            while y < y1 - .001:
                ny = min(y + (first if piece == 0 else 4.6), y1)
                part_box(p, ((x+nx)/2,(y+ny)/2,-.01), (nx-x-.012,ny-y-.012,.02),(stripe+piece)%3)
                y = ny; piece += 1
            x = nx; stripe += 1
        floor = mesh('floor_' + name, p[0], p[1], arch,
                     ['mat_wood_honey','mat_wood_light','mat_wood_warm','mat_wood_edge'], p[2])
        floors.append(floor.name)
        collider('floor_' + name,(x0,y0,-.2),(x1,y1,0),'floor')
        ceil = box('ceiling_' + name,(x0,y0,HEIGHT),(x1,y1,HEIGHT+.18),'mat_ceiling')
        ceilings.append(ceil.name)
        collider('ceiling_' + name,(x0,y0,HEIGHT),(x1,y1,HEIGHT+.18),'ceiling')
    def wall(name, lo, hi, mat='mat_wall_sand'):
        ob = box(name, lo, hi, mat)
        walls.append(ob.name)
        collider(name,lo,hi,'wall')
        return ob
    wall('wall_south',(-18.3,-13.3,0),(18.3,-13.02,HEIGHT),'mat_wall_cream')
    wall('wall_north_west',(-18.3,13.02,0),(7.2,13.3,HEIGHT))
    wall('wall_north_east',(9.8,13.02,0),(18.3,13.3,HEIGHT))
    for side in (-1,1):
        xa, xb = (-18.3,-18.02) if side == -1 else (18.02,18.3)
        label = 'west' if side == -1 else 'east'
        wall('wall_'+label+'_base',(xa,-13.02,0),(xb,13.02,1.05))
        wall('wall_'+label+'_header',(xa,-13.02,4.55),(xb,13.02,HEIGHT),'mat_wall_cream')
        for j in range(6):
            ya = -13.02 + j*4.34 + .30
            yb = -13.02 + (j+1)*4.34
            wall(f'window_{label}_{j:02}',(xa,ya,1.05),(xb,yb,4.55),'mat_glass_blue')
            # Montanti e riflessi geometrici stilizzati: nessuna texture esterna.
            inside = -18.005 if side == -1 else 18.005
            box(f'window_mullion_{label}_{j:02}',(inside-.025,ya+1.95,1.05),(inside+.025,ya+2.01,4.55),'mat_frame_slate')
            box(f'window_reflection_{label}_{j:02}',(inside-.03,ya+.22,1.2),(inside+.03,ya+.32,4.4),'mat_glass_reflection')
        for j, y in enumerate([-13.02+i*4.34 for i in range(6)]):
            wall(f'wall_{label}_pier_{j}',(xa,y,1.05),(xb,min(y+.3,13.02),4.55),'mat_wall_cream')
        box('skirting_'+label,(xa,-13.02,.02),(xb,13.02,.14),'mat_wood_edge')
    # Pannellatura della parete del relatore, fuori dal volume ascensore.
    fill_board_wall(scene)
    # Tavolo grande, gambe e bordo restano oggetti mobili separabili.
    box('table_top',(-2.2,-7.6,.79),(2.2,6.8,.94),'mat_wood_light',furniture,.065)
    box('table_edge',(-2.16,-7.56,.70),(2.16,6.76,.80),'mat_wood_edge',furniture,.035)
    for i,y in enumerate([-5.1,0,4.7]):
        box(f'table_pedestal_{i}',(-.55,y-.48,.08),(.55,y+.48,.72),'mat_frame_slate',furniture,.04)
        box(f'table_foot_{i}',(-1.48,y-.58,.04),(1.48,y+.58,.13),'mat_ink',furniture,.04)
    collider('table',(-2.2,-7.6,0),(2.2,6.8,.94),'table')
    rows = []
    def chair(number, x, y, angle, color, stand):
        tag = f'{number:03}'
        p = ([], [], [])
        # Tutte le parti sono unite nella sola sedia mobile, con materiali distinti.
        for center,size,mid in [((0,0,.53),(.84,.84,.15),0),((0,.36,.93),(.83,.15,.76),0),
                                ((0,0,.29),(.12,.12,.4),1),((0,0,.12),(.76,.12,.08),1),
                                ((0,0,.12),(.12,.76,.08),1),((-.47,0,.77),(.09,.64,.08),1),
                                ((.47,0,.77),(.09,.64,.08),1),((-.45,.1,.65),(.055,.08,.22),1),
                                ((.45,.1,.65),(.055,.08,.22),1)]:
            part_box(p,center,size,mid)
        for xx,yy in [(-.33,0),(.33,0),(0,-.33),(0,.33)]:
            part_box(p,(xx,yy,.055),(.13,.13,.1),2)
        mesh('chair_'+tag,p[0],p[1],furniture,[color,'mat_frame_slate','mat_ink'],p[2],(x,y,0),angle,bevel=.035)
        a = empty('seat_'+tag, anchors,(x,y,.605)); a.rotation_euler.z=angle
        s = empty('stand_'+tag,anchors,(*stand,0)); s.rotation_euler.z=angle
        c,sn=math.cos(angle),math.sin(angle)
        w=.52
        collider('chair_'+tag,(x-w,y-w,0),(x+w,y+w,1.31),'chair')
        rows.append({'anchor':a.name,'stand':s.name,'allowed_occupants':['person','agent'],
                     'position_blender_m':[x,y,.605],'stand_blender_m':[*stand,0],
                     'facing_blender':[sn,-c,0],'role':'speaker' if number==13 else 'participant',
                     'chair_node':'chair_'+tag,'monitor_node':'monitor_'+tag})
    def pc(number, x, y, angle):
        # Locale: -Y e il lato visibile allo spettatore, supporto verso +Y.
        tag=f'{number:03}'; p=([],[],[])
        for center,size,mid in [((0,0,1.35),(.98,.105,.60),0),((0,.02,1.06),(.08,.11,.25),1),
                                ((0,0,.97),(.42,.30,.045),1),((0,-.48,.966),(.76,.27,.04),1)]:
            part_box(p,center,size,mid)
        for k in range(3):
            part_box(p,(0,-.55+.07*k,.991),(.66,.025,.008),2)
        mesh('monitor_'+tag,p[0],p[1],furniture,['mat_ink','mat_frame_slate','mat_keycaps'],p[2],(x,y,0),angle,bevel=.018)
        verts=[(-.435,-.058,1.105),(.435,-.058,1.105),(.435,-.058,1.595),(-.435,-.058,1.595)]
        mesh('pc_screen_'+tag,verts,[(0,1,2,3)],furniture,['mat_screen'],loc=(x,y,0),rot=angle)
        # Interfaccia schematica solo sui PC, separata dalla lavagna dinamica.
        p=([],[],[])
        part_box(p,(-.32,-.064,1.52),(.12,.008,.045))
        part_box(p,(.04,-.064,1.52),(.44,.008,.022))
        part_box(p,(-.12,-.064,1.37),(.45,.008,.018))
        part_box(p,(-.18,-.064,1.30),(.33,.008,.018))
        mesh('pc_interface_'+tag,p[0],p[1],furniture,['mat_screen_detail'],p[2],(x,y,0),angle)
    for i,y in enumerate([-6,-3.6,-1.2,1.2,3.6,6]):
        for side in (-1,1):
            number = i+1 if side == -1 else i+7
            angle = math.pi/2 if side == -1 else -math.pi/2
            color = 'mat_upholstery_teal' if side==-1 else 'mat_upholstery_orange'
            if i in (1,4): color='mat_upholstery_mauve'
            chair(number,side*3.08,y,angle,color,(side*4.55,y))
            pc(number,side*1.48,y,angle+math.pi)
    chair(13,0,7.9,0,'mat_upholstery_orange',(0,9.5))
    pc(13,0,6.15,math.pi)
    # Lavagna: quad dedicato con normale -Y e UV leggibili da sinistra a destra.
    bx,by,bottom,width,height=0,12.28,1.55,8.0,2.7
    ob=mesh('whiteboard_surface',[(-width/2,by,bottom),(width/2,by,bottom),
                                (width/2,by,bottom+height),(-width/2,by,bottom+height)],
            [(0,1,2,3)],furniture,['mat_whiteboard_dynamic'])
    uv=ob.data.uv_layers.new(name='UVMap')
    for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]): loop.uv=coord
    box('whiteboard_backing',(-4.10,by+.025,bottom-.10),(4.10,by+.16,bottom+height+.10),'mat_frame_slate',furniture,.025)
    for name,lo,hi in [('bottom',(-4.12,by-.03,bottom-.12),(4.12,by+.18,bottom)),
                        ('top',(-4.12,by-.03,bottom+height),(4.12,by+.18,bottom+height+.12)),
                        ('left',(-4.12,by-.03,bottom),( -4,by+.18,bottom+height)),
                        ('right',(4,by-.03,bottom),(4.12,by+.18,bottom+height))]:
        box('whiteboard_frame_'+name,lo,hi,'mat_frame_slate',furniture,.015)
    box('whiteboard_tray',(-2.0,by-.25,bottom-.14),(2.0,by+.04,bottom-.09),'mat_frame_slate',furniture,.01)
    collider('whiteboard',(-4.12,by-.25,bottom-.14),(4.12,by+.18,bottom+height+.12),'whiteboard')
    collider_rows.extend(add_plants(scene))
    # Lampade geometriche visibili. Luci effettive solo per anteprima.
    for i,y in enumerate([-5.5,-1.7,2.1,5.9]):
        box(f'pendant_cable_{i}',(-.018,y-.018,4.2),(.018,y+.018,HEIGHT),'mat_ink')
        p=([],[],[])
        # Tronco di piramide low-poly.
        verts=[(-.52,-.30,0),(.52,-.30,0),(.52,.30,0),(-.52,.30,0),
               (-.10,-.08,.28),(.10,-.08,.28),(.10,.08,.28),(-.10,.08,.28)]
        faces=[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
        mesh(f'pendant_shade_{i}',verts,faces,arch,['mat_accent_gold'],loc=(0,y,3.92))
        box(f'pendant_diffuser_{i}',(-.48,y-.26,3.90),(.48,y+.26,3.925),'mat_lamp_glow')
    # Guide di ingombro visibili in wireframe, sempre fuori dalla gerarchia esportata.
    def guide(name,lo,hi,color):
        p=([],[],[]);part_box(p,tuple((a+b)/2 for a,b in zip(lo,hi)),tuple(b-a for a,b in zip(lo,hi)))
        edges=set()
        for face in p[1]:
            for a,b in zip(face,face[1:]+face[:1]): edges.add(tuple(sorted((a,b))))
        me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(p[0],list(edges),[])
        ob=bpy.data.objects.new(name,me);guides.objects.link(ob)
        ob.color=(*color,1);ob.show_in_front=True
        return ob
    guide('ref_design_envelope',(-18,-13,0),(18,13,.015),(.15,.4,.9))
    guide('ref_elevator_reserved',(7.2,10.6,0),(9.8,13,HEIGHT),(1,.35,.08))
    guide('ref_door_clearance_soft',(7.2,8.6,0),(9.8,10.6,.012),(.1,.8,.5))
    # Collider conservati ma nascosti nella vista di lavoro; guide restano riconoscibili.
    for ob in collisions.objects: ob.hide_set(True)
    world=bpy.data.worlds.new('AOP_Preview_World');scene.world=world;world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.65,.74,.83,1);bg.inputs['Strength'].default_value=.35
    def light(name,pos,power,size,target):
        kinds=[v.identifier for v in bpy.types.Light.bl_rna.properties['type'].enum_items]
        if 'AREA' not in kinds: raise RuntimeError('Area light non disponibile')
        data=bpy.data.lights.new(name,'AREA');data.energy=power*.22;enum(data,'shape','DISK');data.size=size
        ob=bpy.data.objects.new(name,data);preview.objects.link(ob);ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    light('preview_table_light',(0,-.5,4.85),3200,12,(0,0,0))
    light('preview_north_light',(0,10,4.7),1800,8,(0,6,1))
    light('preview_south_light',(0,-10,4.6),1700,8,(0,-5,1))
    for side in (-1,1):
        light('preview_window_'+str(side),(side*17,0,3.6),2400,10,(0,1,1))
    def camera(name,pos,look,lens=26,ortho=None):
        data=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,data);preview.objects.link(ob)
        ob.location=pos;ob.rotation_euler=(Vector(look)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.lens=lens;data.clip_end=150
        if ortho: enum(data,'type','ORTHO');data.ortho_scale=ortho
        return ob
    entrance=camera('preview_camera_entrance',(10.7,-11.5,3.6),(0,2,1.45),25)
    camera('preview_camera_top',(0,0,34),(0,0,0),ortho=44)
    camera('preview_camera_whiteboard_from_seat',(-3.08,-1.2,1.65),(0,12.28,2.9),23)
    scene.camera=entrance
    # EEVEE verificato assegnando solo un identificatore ammesso dalla versione corrente.
    try: scene.render.engine='BLENDER_EEVEE'
    except TypeError as ex: raise RuntimeError('Motore di anteprima non disponibile: '+str(ex))
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    enum(scene.render.image_settings,'file_format','PNG')
    transforms=[x.identifier for x in scene.view_settings.bl_rna.properties['view_transform'].enum_items]
    enum(scene.view_settings,'view_transform','Standard')
    scene.view_settings.exposure=-.25
    # Salva una vista iniziale navigabile dall'interno.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                sp=area.spaces.active
                enum(sp.shading,'type','MATERIAL')
                sp.region_3d.view_rotation=entrance.rotation_euler.to_quaternion()
                sp.region_3d.view_location=(0,1,1.6)
                sp.region_3d.view_distance=19
                enum(sp.region_3d,'view_perspective','CAMERA')
                sp.overlay.show_overlays=False
    bpy.context.view_layer.update()
    m=json.loads((KIT/'templates/conference_room.manifest.json').read_text(encoding='utf8'))
    m.update(blender_version=bpy.app.version_string,ceiling_height_m=HEIGHT,
             architecture={'floor_nodes':floors,'wall_nodes':walls,'ceiling_nodes':ceilings},
             seats=sorted(rows,key=lambda s:s['anchor']),colliders=collider_rows,
             whiteboard={'surface_node':'whiteboard_surface','material':'mat_whiteboard_dynamic',
                         'width_m':width,'height_m':height,'additional_surfaces':[],
                         'normal_blender':[0,-1,0],'uv_orientation':'U=+X, V=+Z viewed from -Y'},
             design_stage='v01_pending_visual_review',
             notes=['Prima bozza richiesta da Juri: 6 posti per lato lungo, 1 relatore, 13 monitor, lavagna dietro al relatore.',
                    'Palette e forme ispirate allo screenshot Agent Office; proporzioni e finiture della bozza da rivedere con Juri.',
                    'Correzioni richieste: PC rivolti alle rispettive sedie; due piante ai lati della lavagna.',
                    'Ascensore e suo vano non modellati: intaglio in pavimento, parete nord e soffitto.',
                    'Finestre esterne stilizzate blu; divisorio interno trasparente. Nessuna risorsa esterna.',
                    'La superficie lavagna e vuota e dinamica; integrazione Excalidraw e materiali toon a carico del software.',
                    'Intaglio ascensore aperto: la copertura definitiva dipende dalla geometria generata dall applicazione.'])
    center_meeting_zone(scene,m)
    partition=add_glass_partition(scene)
    m['architecture']['wall_nodes'].extend(partition['wall_nodes'])
    m['colliders'].extend(partition['colliders'])
    m['room_partition']=partition['partition']
    south=add_south_windows(scene)
    m['architecture']['wall_nodes']=[n for n in m['architecture']['wall_nodes'] if n!='wall_south']+south['wall_nodes']
    m['colliders']=[r for r in m['colliders'] if r['id']!='col_wall_south']+south['colliders']
    lounge=add_lounge(scene)
    m['seats'].extend(lounge['seats']);m['colliders'].extend(lounge['colliders'])
    m['notes'].extend(lounge['notes'])
    m['lounge_nodes']=lounge['nodes']
    m['seat_counts_by_role']={'meeting':13,'lounge':6}
    match_meeting_pendants_to_lounge(scene)
    scene.camera=bpy.data.objects['preview_camera_lounge']
    manifest=output/'conference_room.manifest.json'
    if manifest.exists(): raise RuntimeError('Manifest destinazione gia presente')
    manifest.write_text(json.dumps(m,indent=2)+'\n',encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    print(json.dumps({'scene':scene.name,'blend':str(target),'manifest':str(manifest),'meeting_seats':13,'lounge_seats':6,'height_m':HEIGHT}))
    return scene


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-dir',type=Path,default=KIT/'work')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    build(args.output_dir)
