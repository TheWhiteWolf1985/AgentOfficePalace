"""Involucro sala server, 18 novembre 2026. Solo bpy, nessuna risorsa esterna.
blender --background --python build_scene.py -- --output-dir <nuova cartella>
Non cancella scene e rifiuta di sovrascrivere il sorgente.
"""
from pathlib import Path
import argparse
import json
import sys
import runpy
import bpy
from mathutils import Vector

SCENE = 'AOP_Sala_Server_v12'
HEIGHT = 5.2


def enum(owner, prop, value):
    options = [v.identifier for v in owner.bl_rna.properties[prop].enum_items]
    try:
        setattr(owner, prop, value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f'{prop}: {value}, disponibili {options}') from exc


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def build(output):
    output = Path(output).resolve()
    if (output / 'server_room.blend').exists() or SCENE in bpy.data.scenes:
        raise RuntimeError('File o scena esistente: usare una nuova destinazione/versione.')
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    enum(scene.unit_settings, 'system', 'METRIC')
    scene.unit_settings.scale_length = 1
    enum(scene.unit_settings, 'length_unit', 'METERS')
    asset = bpy.data.collections.new('SERVER_V12_Asset')
    preview = bpy.data.collections.new('SERVER_V12_Anteprima_NON_ESPORTARE')
    guides = bpy.data.collections.new('SERVER_V12_Guide_NON_ESPORTARE')
    for c in (asset, preview, guides):
        scene.collection.children.link(c)
    guides.hide_render = True
    palette = {
        'wall_cream': (.94,.85,.68), 'wall_sand': (.86,.69,.49),
        'wood_light': (.94,.73,.44), 'wood_warm': (.89,.66,.38),
        'wood_honey': (.87,.62,.34), 'wood_edge': (.67,.43,.24),
        'frame_slate': (.40,.47,.46), 'glass_blue': (.26,.43,.51),
        'glass_reflection': (.41,.60,.64), 'ceiling': (.91,.86,.73),
        'tile_light_gray': (.87,.89,.90), 'grout_gray': (.64,.67,.69),
    }
    mats = {}
    for name, rgb in palette.items():
        mat = bpy.data.materials.new('server_v12_mat_' + name)
        mat.use_nodes = True
        mat.diffuse_color = (*rgb, 1)
        shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = (*map(linear, rgb), 1)
        shader.inputs['Roughness'].default_value = .3 if 'glass' in name else .74
        mats[name] = mat

    def empty(name, parent=None, collection=asset):
        ob = bpy.data.objects.new('server_v12_' + name, None)
        collection.objects.link(ob)
        ob.parent = parent
        ob.empty_display_size = .25
        return ob

    root = empty('root')
    root['stage'] = 'architectural_draft_review_with_Juri'
    arch = empty('architecture', root)
    ceiling = empty('ceiling', arch)
    colliders = []

    def mesh(name, vertices, faces, material, parent=arch):
        data = bpy.data.meshes.new('server_v12_' + name + '_mesh')
        data.from_pydata(vertices, [], faces)
        data.materials.append(mats[material])
        data.update()
        ob = bpy.data.objects.new('server_v12_' + name, data)
        asset.objects.link(ob)
        ob.parent = parent
        return ob

    faces_box = [(0,2,3,1),(0,1,5,4),(1,3,7,5),(3,2,6,7),(2,0,4,6),(4,5,7,6)]

    def box(name, lo, hi, material, parent=arch, collision=False):
        vertices = [(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
        ob = mesh(name, vertices, faces_box, material, parent)
        if collision:
            colliders.append({'node': ob.name, 'min_blender_m': list(lo), 'max_blender_m': list(hi)})
        return ob

    # Intaglio reale fino al bordo esterno: nessun fondo o soglia nel vano.
    zones = [('main',-18.3,18.3,-13.3,10.6),
             ('north_west',-18.3,7.2,10.6,13.3),
             ('north_east',9.8,18.3,10.6,13.3)]
    floors = []
    for label,x0,x1,y0,y1 in zones:
        ob=box('floor_support_'+label,(x0,y0,-.2),(x1,y1,-.02),'grout_gray',collision=True)
        floors.append(ob.name)
        # I box di riferimento coprono anche la finitura sovrastante.
        colliders[-1]['max_blender_m'][2]=0
        ob=box('ceiling_'+label,(x0,y0,HEIGHT),(x1,y1,HEIGHT+.18),'ceiling',ceiling,True)
        ob.hide_set(True)  # Solo viewport: soffitto esportato e presente nei render interni.
    # Griglia unica 60x60 cm, ancorata all'angolo interno sud-ovest.
    # Fughe 4 mm incluse nel modulo nominale; tagli solo sui bordi e sul vano.
    verts,faces,ids=[],[],[]
    tile_rows=[]
    for ix in range(-1,61):
        for iy in range(-1,45):
            x0=max(-18.3,-18+ix*.6+.002); x1=min(18.3,-18+(ix+1)*.6-.002)
            y0=max(-13.3,-13+iy*.6+.002); y1=min(13.3,-13+(iy+1)*.6-.002)
            if x1<=x0 or y1<=y0: continue
            parts=[(x0,x1,y0,y1)]
            if x0<9.8 and x1>7.2 and y1>10.6:
                # Differenza rettangolare: nessuna piastrella attraversa l'intaglio.
                parts=[]
                if y0<10.6: parts.append((x0,x1,y0,10.6))
                ya=max(y0,10.6)
                if x0<7.2: parts.append((x0,min(x1,7.2),ya,y1))
                if x1>9.8: parts.append((max(x0,9.8),x1,ya,y1))
            material_id=0  # Tutte le piastrelle nello stesso grigio chiaro uniforme.
            for xa,xb,ya,yb in parts:
                if xb-xa<.001 or yb-ya<.001: continue
                offset=len(verts)
                verts.extend((x,y,z) for z in (-.02,0) for y in (ya,yb) for x in (xa,xb))
                faces.extend(tuple(offset+i for i in f) for f in faces_box)
                ids.extend([material_id]*6)
                tile_rows.append({'min':[xa,ya,-.02],'max':[xb,yb,0]})
    ob=mesh('floor_tiles_60x60',verts,faces,'tile_light_gray')
    for p,i in zip(ob.data.polygons,ids): p.material_index=i
    floors.append(ob.name)
    ob['module_m']=.6;ob['grout_width_m']=.004
    box('wall_north_west',(-18.3,13,0),(7.2,13.3,HEIGHT),'wall_sand',collision=True)
    box('wall_north_east',(9.8,13,0),(18.3,13.3,HEIGHT),'wall_sand',collision=True)
    corner_nodes=[]
    for tag,xa,xb in [('west',-18.3,-18.),('east',18.,18.3)]:
        corner_nodes.append(box('wall_corner_south_'+tag,(xa,-13.3,0),(xb,-13,HEIGHT),'wall_cream',collision=True).name)
    windows=[]
    perimeter_junction={}
    # Finestre con fasce murarie, pilastri e davanzali, come la sala riunioni.
    for side,count,start,end in [('west',6,-13,13),('east',6,-13,13),('south',8,-18,18)]:
        if side=='west':
            def coords(a,b,z0,z1,offset=0,depth=.3):
                return (-18.3+offset,a,z0),(-18.3+offset+depth,b,z1)
        elif side=='east':
            def coords(a,b,z0,z1,offset=0,depth=.3):
                return (18.3-offset-depth,a,z0),(18.3-offset,b,z1)
        else:
            def coords(a,b,z0,z1,offset=0,depth=.3):
                return (a,-13.3+offset,z0),(b,-13.3+offset+depth,z1)
        def band(name,a,b,z0,z1,mat,offset=0,depth=.3,collision=False):
            lo,hi=coords(a,b,z0,z1,offset,depth)
            return box(name,lo,hi,mat,collision=collision)
        band('wall_'+side+'_base',start,end,0,1.05,'wall_sand',collision=True)
        band('wall_'+side+'_header',start,end,4.55,HEIGHT,'wall_cream',collision=True)
        step=(end-start)/count
        for i in range(count):
            a=start+i*step; b=a+step
            band(f'wall_{side}_pier_{i:02}',a,a+.3,1.05,4.55,'wall_cream',collision=True)
            ob=band(f'window_{side}_{i:02}',a+.3,b,1.05,4.55,'glass_blue',collision=True)
            windows.append({'node':ob.name,'side':side})
            mid=(a+.3+b)/2
            junction_here=side=='south' and a+.3<6.04 and b>6.16
            if junction_here:
                # Two actual panes leave a gap for the partition's aligned jamb.
                vv=[];ff=[]
                for x0,x1 in [(a+.3,6.04),(6.16,b)]:
                    offset=len(vv)
                    vv.extend((x,y,z) for z in (1.05,4.55) for y in (-13.3,-13.) for x in (x0,x1))
                    ff.extend(tuple(offset+j for j in face) for face in faces_box)
                ob.data.clear_geometry();ob.data.from_pydata(vv,[],ff);ob.data.update()
                stile=box('wall_south_partition_window_stile',(6.04,-13.3,1.05),(6.16,-13,4.55),'frame_slate',collision=True)
                inner=box('wall_south_partition_inner_post',(6.04,-13,0),(6.16,-12.95,HEIGHT),'frame_slate',collision=True)
                perimeter_junction={'window_node':ob.name,'window_stile':stile.name,
                    'inner_post':inner.name,'axis_x_m':6.1,'glass_gap_x_m':[6.04,6.16],
                    'inside_post_face_y_m':-12.95}
            else:
                band(f'window_{side}_{i:02}_mullion',mid-.03,mid+.03,1.05,4.55,'frame_slate',.295,.055)
            band(f'window_{side}_{i:02}_reflection',a+.53,a+.63,1.2,4.4,'glass_reflection',.296,.06)
            sa,sb=a,b
            if side in ('west','east') and i==0:sa=-12.90
            if side=='south' and i==0:sa=-18.06
            if side=='south' and i==count-1:sb=18.06
            band(f'window_{side}_{i:02}_sill',sa,sb,1.01,1.10,'wood_light',.24,.16)
        skirt_start=-12.97 if side in ('west','east') else start
        band('skirting_'+side,skirt_start,end,.02,.14,'wood_edge',.29,.04)

    # Tre lavagne indipendenti, centrate sul tratto muro ovest -> ascensore.
    boards=[]
    board_group=empty('whiteboards',arch)
    board_width,board_height,board_gap=6.4,2.8,1.4
    for i,cx in enumerate((-13.2,-5.4,2.4),1):
        group=empty(f'whiteboard_{i:03}',board_group)
        x0,x1=cx-board_width/2,cx+board_width/2
        z0,z1=1.15,1.15+board_height
        box(f'whiteboard_{i:03}_backing',(x0-.10,12.86,z0-.10),(x1+.10,12.98,z1+.10),'frame_slate',group)
        for tag,lo,hi in [
            ('left',(x0-.10,12.77,z0-.10),(x0,12.87,z1+.10)),
            ('right',(x1,12.77,z0-.10),(x1+.10,12.87,z1+.10)),
            ('bottom',(x0,12.77,z0-.10),(x1,12.87,z0)),
            ('top',(x0,12.77,z1),(x1,12.87,z1+.10))]:
            box(f'whiteboard_{i:03}_frame_'+tag,lo,hi,'frame_slate',group)
        # Vertici dal basso a sinistra: normale verso -Y, UV non specchiate.
        ob=mesh(f'whiteboard_surface_{i:03}',[(x0,12.82,z0),(x1,12.82,z0),
                  (x1,12.82,z1),(x0,12.82,z1)],[(0,1,2,3)],'wall_cream',group)
        mat=bpy.data.materials.new(f'server_v12_mat_whiteboard_dynamic_{i:03}')
        mat.use_nodes=True; mat.diffuse_color=(.97,.97,.97,1)
        sh=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        sh.inputs['Base Color'].default_value=(*map(linear,(.97,.97,.97)),1)
        sh.inputs['Roughness'].default_value=.8
        ob.data.materials.clear();ob.data.materials.append(mat)
        uv=ob.data.uv_layers.new(name='UVMap')
        for loop,coord in zip(ob.data.polygons[0].loop_indices,((0,0),(1,0),(1,1),(0,1))):
            uv.data[loop].uv=coord
        ob['role']='dynamic_whiteboard_surface';ob['content']='blank'
        boards.append({'id':f'whiteboard_{i:03}','group':group.name,'surface_node':ob.name,
                       'intended_use':'server_and_agent_monitoring',
                       'material':mat.name,'size_m':[board_width,board_height],
                       'center_blender_m':[cx,12.82,(z0+z1)/2],
                       'normal_blender':[0,-1,0],'uv_range':[0,1]})

    # Guide separate non esportate, nascoste ma riattivabili.
    marker=empty('guide_elevator_reserved',collection=guides)
    marker.location=(8.5,11.95,HEIGHT/2)
    enum(marker,'empty_display_type','CUBE')
    marker.empty_display_size=1
    marker.scale=(1.3,1.35,HEIGHT/2)
    marker.hide_set(True)

    world=bpy.data.worlds.new('SERVER_V12_Preview_World')
    scene.world=world; world.use_nodes=True
    bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(.65,.74,.83,1)
    bg.inputs['Strength'].default_value=.35
    for i,(pos,target,power,size) in enumerate([
        ((0,0,4.9),(0,0,0),1100,14),((0,-9,4.7),(0,-4,0),550,9),
        ((0,9,4.7),(0,4,0),550,9),((-17,0,3.6),(0,0,1),550,10),
        ((17,0,3.6),(0,0,1),550,10)]):
        data=bpy.data.lights.new(f'server_v12_preview_light_{i}','AREA')
        enum(data,'shape','DISK'); data.energy=power*.45; data.size=size
        ob=bpy.data.objects.new(data.name,data); preview.objects.link(ob); ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    rack_module=runpy.run_path(str(Path(__file__).resolve().parent/'build_racks.py'))
    rack_result=rack_module['add_racks'](scene,root,asset,preview,'server_v12_')
    colliders.extend(rack_result['colliders'])
    vent_module=runpy.run_path(str(Path(__file__).resolve().parent/'build_ventilation.py'))
    ventilation=vent_module['add_ventilation'](scene,root,asset,preview,'server_v12_')
    partition_module=runpy.run_path(str(Path(__file__).resolve().parent/'build_partition.py'))
    partition=partition_module['add_partition'](scene,root,asset,preview,'server_v12_')
    colliders.extend(partition['colliders'])
    # Correzione esplicita di Juri: tutti i vetri perimetrali come la partizione.
    shared_glass=bpy.data.materials['server_v12_access_mat_glass']
    for ob in asset.objects:
        if ob.type=='MESH':
            for slot in ob.material_slots:
                if slot.material in (mats['glass_blue'],mats['glass_reflection']):
                    slot.material=shared_glass
    ops_module=runpy.run_path(str(Path(__file__).resolve().parent/'build_operations.py'))
    operations=ops_module['add_operations'](scene,root,asset,preview,'server_v12_')
    colliders.extend(operations['colliders'])
    for label,pos,target,lens,ortho in [
        ('interior',(0,-11.7,3.0),(-4,12,2.5),21,None),
        ('reverse',(13,10,3.4),(-2,-7,1.8),21,None),
        ('top',(0,0,42),(0,0,0),35,43)]:
        data=bpy.data.cameras.new('server_v12_preview_'+label)
        ob=bpy.data.objects.new(data.name,data); preview.objects.link(ob); ob.location=pos
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.lens=lens; data.clip_end=200
        if ortho: enum(data,'type','ORTHO'); data.ortho_scale=ortho
    scene.camera=scene.objects['server_v12_preview_overview']
    try: scene.render.engine='BLENDER_EEVEE'
    except TypeError as exc: raise RuntimeError(str(exc)) from exc
    scene.render.resolution_x=1440; scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    enum(scene.render.image_settings,'file_format','PNG')
    enum(scene.view_settings,'view_transform','Standard')
    scene.view_settings.exposure=-.3
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                enum(space.shading,'type','MATERIAL')
                space.overlay.show_extras=False
                space.overlay.show_relationship_lines=False
                enum(space.region_3d,'view_perspective','CAMERA')
    bpy.context.view_layer.update()
    manifest={'stage':'architectural_draft','name':'sala_server',
        'blender_version':bpy.app.version_string,'root_node':root.name,'units':'meters',
        'interior_xy_m':[-18,18,-13,13],'ceiling_height_m':HEIGHT,
        'provisional_choices':['altezza 5,2m','palette degli ambienti precedenti'],
        'elevator_reserved_blender_m':{'min':[7.2,10.6,-.3],'max':[9.8,13.3,5.38]},
        'elevator_runtime':'generated_by_application_no_cabin_door_or_backdrop_in_asset',
        'architecture':{'floor_nodes':floors,'ceiling_group':ceiling.name},
        'architectural_junctions':{'south_corner_nodes':corner_nodes,'partition_south':perimeter_junction},
        'floor_finish':{'type':'tiles','nominal_module_m':[.6,.6],
                        'grout_m':.004,'palette':'uniform_light_gray',
                        'tile_color_srgb':[.87,.89,.90],
                        'node':'server_v12_floor_tiles_60x60','pieces':len(tile_rows),
                        'grid_origin_xy_m':[-18,-13]},
        'windows':windows,'collider_reference_boxes':colliders,
        'window_glazing':{'material':shared_glass.name,'same_as_access_partition':True,
                          'alpha':.12,'transparent':True},
        'racks':rack_result['racks'],'rack_layout':rack_result['layout'],
        'rack_material_palette_srgb':rack_result['palette_srgb'],
        'ventilation':ventilation,
        'access_partition':partition,
        'operations':operations,
        'whiteboards':boards,'whiteboard_layout':{'surface_gap_m':board_gap,
            'frame_gap_m':board_gap-.2,'aligned_wall':'north_left_of_elevator',
            'dimensions_provisional':True,'runtime_monitoring':'not_implemented'},
        'material_palette_srgb':palette,'gltf_from_blender':['x','z','-y'],
        'not_implemented':['integrazione applicativa','alimentazione/rete/raffreddamento runtime']}
    (output/'server_room.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'server_room.blend'),copy=True)
    print(json.dumps({'scene':scene.name,'file':str(output/'server_room.blend'),'windows':len(windows),'objects':len(scene.objects)}))
    return scene


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent/'v12')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    build(args.output_dir)
