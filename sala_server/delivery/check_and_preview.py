"""Verifiche ed export della bozza; render reali interni e pianta.
blender --background work/v01/server_room.blend --python work/check_and_preview.py
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import bpy
from mathutils import Vector

scene=bpy.context.scene
assert scene.name.startswith('AOP_Sala_Server_v'),scene.name
out=Path(bpy.data.filepath).parent
manifest=json.loads((out/'server_room.manifest.json').read_text(encoding='utf8'))
root=scene.objects[manifest['root_node']]
prefix=root.name[:-4]
objects=[root]+list(root.children_recursive)
meshes=[ob for ob in objects if ob.type=='MESH']


def bounds(ob):
    points=[ob.matrix_world@Vector(p) for p in ob.bound_box]
    return [min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]


def signature(ob):
    return {'bounds':bounds(ob),'materials':[m.name for m in ob.data.materials],
            'matrix':[v for row in ob.matrix_world for v in row]}


source={ob.name:signature(ob) for ob in meshes}
hole=((7.2,9.8),(10.6,13.3),(-.3,5.38))
overlaps=[]
for ob in meshes:
    lo,hi=bounds(ob)
    # Meshes are made of independent, ordered eight-vertex axis-aligned boxes.
    # Check each solid box when the complete object's AABB crosses the hole.
    if all(min(hi[i],b)-max(lo[i],a)>.0001 for i,(a,b) in enumerate(hole)):
        assert len(ob.data.vertices)%8==0,ob.name
        for offset in range(0,len(ob.data.vertices),8):
            points=[ob.matrix_world@v.co for v in ob.data.vertices[offset:offset+8]]
            mn=[min(p[i] for p in points) for i in range(3)]
            mx=[max(p[i] for p in points) for i in range(3)]
            if all(min(mx[i],b)-max(mn[i],a)>.0001 for i,(a,b) in enumerate(hole)):
                overlaps.append(ob.name);break
window_counts={side:sum(ob.name.startswith(prefix+'window_'+side+'_') and
                       ob.name.rsplit('_',1)[-1].isdigit() for ob in meshes)
               for side in ('west','east','south','north')}
checks={
    'root_identity':list(root.location)==[0,0,0] and list(root.scale)==[1,1,1] and not any(root.rotation_euler),
    'meters':scene.unit_settings.scale_length==1,
    'elevator_open_floor_ceiling_north_wall':not overlaps,
    'windows_two_short_sides_and_opposite_long_side':window_counts=={'west':6,'east':6,'south':8,'north':0},
    'all_mesh_scales_one':all(max(abs(s-1) for s in ob.scale)<1e-6 for ob in meshes),
    'finite_vertices':all(math.isfinite(v) for ob in meshes for p in ob.data.vertices for v in p.co),
    'outer_xy_bounds':all(lo[0]>=-18.301 and hi[0]<=18.301 and lo[1]>=-13.301 and hi[1]<=13.301 for lo,hi in (bounds(ob) for ob in meshes)),
    'no_elevator_cabin_or_door':not any('elevator' in ob.name for ob in objects),
}
if prefix+'floor_tiles_60x60' in scene.objects:
    tiles=scene.objects[prefix+'floor_tiles_60x60']
    checks['tile_module_60cm']=abs(tiles['module_m']-.6)<1e-7 and abs(tiles['grout_width_m']-.004)<1e-7
    checks['tiles_uniform_light_gray']=len(tiles.data.materials)==1 and tiles.data.materials[0].name==prefix+'mat_tile_light_gray' and all(p.material_index==0 for p in tiles.data.polygons)
    shader=next(n for n in tiles.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    checks['tiles_flat_color_no_texture']=not shader.inputs['Base Color'].is_linked and not any(n.type=='TEX_IMAGE' for n in tiles.data.materials[0].node_tree.nodes)
    full_tiles=0
    for offset in range(0,len(tiles.data.vertices),8):
        pts=[v.co for v in tiles.data.vertices[offset:offset+8]]
        dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in (0,1)]
        assert all(d<=.59601 for d in dims),dims
        if all(abs(d-.596)<.00001 for d in dims):full_tiles+=1
    checks['full_size_tiles_present']=full_tiles>2400
boards=manifest.get('whiteboards',[])
if boards:
    board_objects=[scene.objects[row['surface_node']] for row in boards]
    checks['three_equal_whiteboards_left_of_elevator']=len(boards)==3 and len({tuple(row['size_m']) for row in boards})==1 and all(bounds(ob)[1][0]<7.2 for ob in board_objects)
    checks['whiteboards_separate_quads']=all(len(ob.data.vertices)==4 and len(ob.data.polygons)==1 and len(ob.data.materials)==1 for ob in board_objects)
    checks['whiteboards_blank']=all(not any(n.type=='TEX_IMAGE' for n in ob.data.materials[0].node_tree.nodes) for ob in board_objects)
    checks['whiteboards_face_room']=all(ob.data.polygons[0].normal.dot(Vector((0,-1,0)))>.999 for ob in board_objects)
    checks['whiteboard_uv_0_1_not_mirrored']=all(
        [tuple(round(v,5) for v in uv.uv) for uv in ob.data.uv_layers.active.data]==[(0,0),(1,0),(1,1),(0,1)] for ob in board_objects)
    checks['whiteboards_spaced_equally']=all(abs(bounds(board_objects[i+1])[0][0]-bounds(board_objects[i])[1][0]-1.4)<.001 for i in range(2))
racks=manifest.get('racks',[])
if racks:
    rack_groups=[scene.objects[r['node']] for r in racks]
    actual_bounds=[]
    for group in rack_groups:
        pts=[ob.matrix_world@Vector(p) for ob in group.children_recursive if ob.type=='MESH' for p in ob.bound_box]
        actual_bounds.append(([min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]))
    layout=manifest['rack_layout']
    checks['three_rows_20_racks_each']=len(racks)==60 and all(sum(r['row']==i for r in racks)==20 for i in (1,2,3))
    checks['rack_height_actual_220cm']=all(abs(hi[2]-lo[2]-2.2)<.0001 and abs(lo[2])<.0001 for lo,hi in actual_bounds)
    checks['rack_population_real_nodes']=all(len([ob for ob in group.children if ob.get('device_type')=='compute'])==14 and any(ob.get('device_type')=='storage' for ob in group.children) for group in rack_groups)
    checks['rack_doors_framed_glass']=all(scene.objects[n].get('role')=='framed_glass_door' and any(m.name==prefix+'rack_mat_glass' for m in scene.objects[n].data.materials) for r in racks for n in r['doors'])
    checks['racks_in_three_requested_lines']=all(abs(scene.objects[r['node']].location.y-layout['row_y_m'][r['row']-1])<1e-5 for r in racks)
    rect=layout['requested_floor_rectangle_m']
    checks['all_racks_inside_latest_red_rectangle']=all(
        all(lo[i]>=rect['min'][i]-.0001 and hi[i]<=rect['max'][i]+.0001 for i in (0,1))
        for lo,hi in actual_bounds)
    checks['row_ends_align_inside_rectangle']=all(abs(max(hi[0] for r,(lo,hi) in zip(racks,actual_bounds) if r['row']==row)-layout['right_edge_blender_x_m'])<.0001 for row in (1,2,3))
    checks['service_aisles_at_least_2m']=all(
        min(lo[1] for r,(lo,hi) in zip(racks,actual_bounds) if r['row']==row+1)-
        max(hi[1] for r,(lo,hi) in zip(racks,actual_bounds) if r['row']==row)>=1.999 for row in (1,2))
    # Clear reference corridor in front of the whiteboards and elevator approach.
    checks['north_whiteboard_corridor_clear']=all(hi[1]<10.6 for lo,hi in actual_bounds)
hidden={ob:ob.hide_get() for ob in objects}
operations=manifest.get('operations')
if operations:
    checks['two_pc_workstations_two_chairs']=len(operations['workstations'])==2 and len(operations['seats'])==2
    checks['four_pc_screens_face_operators']=len(operations['pc_screen_nodes'])==4 and all(
        scene.objects[name].data.polygons[0].normal.dot(Vector((1,0,0)))>.999 for name in operations['pc_screen_nodes'])
    checks['operations_outside_server_partition']=all(bounds(ob)[0][0]>manifest['access_partition']['wall_x_m']+.1
        for ob in scene.objects[operations['group']].children_recursive if ob.type=='MESH')
    checks['maintenance_server_and_two_closed_cabinets']=len(operations['closed_cabinets'])==2 and len(scene.objects[operations['open_server']].children)>0
    checks['monitoring_remains_three_internal_surfaces']=len(boards)==3 and operations['monitoring_panels']=='three_existing_whiteboards_inside_server_zone'
    # Reference routes use actual mesh footprints expanded by a visitor radius.
    visitor_radius=.32
    door_approach=(6.30,9.40,-1.20,1.20)
    elevator_spine=(7.10,9.30,-1.20,10.60)
    def route_clear(rect):
        for ob in scene.objects[operations['group']].children_recursive:
            if ob.type!='MESH':continue
            lo,hi=bounds(ob)
            if min(hi[2],1.7)<=max(lo[2],0):continue
            if min(hi[0]+visitor_radius,rect[1])-max(lo[0]-visitor_radius,rect[0])>.001 and min(hi[1]+visitor_radius,rect[3])-max(lo[1]-visitor_radius,rect[2])>.001:
                return False
        return True
    checks['door_approach_and_elevator_spine_clear']=route_clear(door_approach) and route_clear(elevator_spine)
partition=manifest.get('access_partition')
if manifest.get('window_glazing'):
    glazing=manifest['window_glazing']
    checks['all_perimeter_windows_use_partition_glass']=len(manifest['windows'])==20 and all(
        len(scene.objects[w['node']].data.materials)==1 and
        scene.objects[w['node']].data.materials[0].name==glazing['material'] for w in manifest['windows'])
    glass=bpy.data.materials[glazing['material']]
    shader=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    checks['window_glass_transparent_blended']=glass.surface_render_method=='BLENDED' and 0<shader.inputs['Alpha'].default_value<.2
if partition:
    keypad=partition['keypad'];door=partition['door'];wall_x=partition['wall_x_m']
    checks['glass_partition_full_width_height']=partition.get('perimeter_inner_span_y_m',partition['span_y_m'])==[-13,13] and abs(partition['height_m']-5.2)<.0001 and len(partition['glass_nodes'])==24
    checks['rack_shifted_two_meters_from_v08']=all(abs(r['position_blender_m'][0]-(-11.45+.85*(r['column']-1)-2))<.0001 for r in racks)
    checks['racks_clear_of_glass_partition']=all(hi[0]<wall_x-2.0 for lo,hi in actual_bounds)
    checks['door_separate_and_closed']=scene.objects[door['pivot']].get('interaction')=='hinged_access_door' and abs(scene.objects[door['pivot']].rotation_euler.z)<1e-6
    checks['keypad_on_right_outside']=scene.objects[keypad['node']].location.x>wall_x and scene.objects[keypad['node']].location.y>.8
    checks['keypad_12_independent_keys']={b['key'] for b in keypad['buttons']}==set('123456789*0#') and all(scene.objects[b['node']].get('key')==b['key'] for b in keypad['buttons'])
    checks['keypad_display_separate_uv']=len(scene.objects[keypad['display_node']].data.uv_layers)==1
    if manifest.get('architectural_junctions'):
        joints=manifest['architectural_junctions']
        corners=[scene.objects[n] for n in joints['south_corner_nodes']]
        expected=[([-18.3,-13.3,0],[-18,-13,5.2]),([18,-13.3,0],[18.3,-13,5.2])]
        checks['two_exterior_corners_square_and_closed']=len(corners)==2 and all(
            max(abs(v-w) for row_a,row_b in zip(bounds(ob),target) for v,w in zip(row_a,row_b))<.0001
            for ob,target in zip(corners,expected))
        fixed=scene.objects[partition['fixed_group']]
        checks['partition_terminates_inside_wall_faces']=all(bounds(ob)[0][1]>=-13.0001 and bounds(ob)[1][1]<=13.0001
            for ob in fixed.children_recursive if ob.type=='MESH')
        south=joints['partition_south'];window=scene.objects[south['window_node']]
        glass_boxes=[]
        for offset in range(0,len(window.data.vertices),8):
            points=[window.matrix_world@v.co for v in window.data.vertices[offset:offset+8]]
            glass_boxes.append(([min(p[i] for p in points) for i in range(3)],
                                [max(p[i] for p in points) for i in range(3)]))
        post_lo,post_hi=bounds(scene.objects[south['window_stile']])
        checks['perimeter_glass_cut_around_junction_stile']=len(glass_boxes)==2 and all(
            not all(min(hi[i],post_hi[i])-max(lo[i],post_lo[i])>.0001 for i in range(3)) for lo,hi in glass_boxes)
        checks['partition_joint_aligned_to_window_stile']=abs((post_lo[0]+post_hi[0])/2-wall_x)<.0001 and abs(partition['span_y_m'][0]-south['inside_post_face_y_m']-.01)<.0001
ventilation=manifest.get('ventilation')
if ventilation:
    modules=ventilation['modules']
    checks['six_ceiling_extractors_two_per_row']=len(modules)==6 and all(sum(m['row']==i for m in modules)==2 for i in (1,2,3))
    vent_bounds=[]
    for module in modules:
        group=scene.objects[module['node']]
        points=[ob.matrix_world@Vector(p) for ob in group.children_recursive if ob.type=='MESH' for p in ob.bound_box]
        vent_bounds.append(([min(p[i] for p in points) for i in range(3)],
                            [max(p[i] for p in points) for i in range(3)]))
    checks['extractors_reach_ceiling']=all(abs(hi[2]-manifest['ceiling_height_m'])<.0001 for lo,hi in vent_bounds)
    checks['extractors_above_racks_clear']=all(lo[2]>2.2+2.0 for lo,hi in vent_bounds)
    checks['extractors_above_each_rack_row']=all(abs(scene.objects[m['node']].location.y-manifest['rack_layout']['row_y_m'][m['row']-1])<1e-5 for m in modules)
    checks['extractors_guard_and_separate_rotor']=all(
        all(scene.objects[n].type=='MESH' for n in m['nodes'].values()) and
        scene.objects[m['nodes']['rotor']].get('role')=='extractor_rotor_8_blades' for m in modules)
    if partition:
        checks['extractors_shifted_two_meters_from_v08']=all(abs(m['position_blender_m'][0]-(-10 if m['id'].endswith('01') else -1))<.0001 for m in modules)
for sc in bpy.data.scenes:
    for layer in sc.view_layers:
        for ob in layer.objects: ob.select_set(False,view_layer=layer)
for ob in objects:
    ob.hide_set(False);ob.select_set(True)
bpy.context.view_layer.objects.active=root
props=bpy.ops.export_scene.gltf.get_rna_type().properties
kwargs={'filepath':str(out/'server_room.glb'),'export_format':'GLB','use_selection':True,
        'export_extras':True,'export_cameras':False,'export_lights':False,'export_apply':True,'export_yup':True}
bpy.ops.export_scene.gltf(**{k:v for k,v in kwargs.items() if k in props})
for ob,value in hidden.items(): ob.hide_set(value)
blob=(out/'server_room.glb').read_bytes()
magic,version,length=struct.unpack_from('<4sII',blob)
chunklen,_=struct.unpack_from('<II',blob,12)
doc=json.loads(blob[20:20+chunklen])
names={n.get('name') for n in doc['nodes']}
checks.update({
    'glb2':magic==b'glTF' and version==2 and length==len(blob),
    'self_contained':all('uri' not in row for row in doc.get('buffers',[])+doc.get('images',[])),
    'no_required_decoder':not doc.get('extensionsRequired'),
    'only_asset_nodes':names=={ob.name for ob in objects},
    'no_preview_cameras_lights':not doc.get('cameras') and 'KHR_lights_punctual' not in doc.get('extensions',{}),
})
if manifest.get('window_glazing'):
    exported_glass=next(m for m in doc['materials'] if m['name']==manifest['window_glazing']['material'])
    checks['glb_window_transparency_preserved']=exported_glass.get('alphaMode')=='BLEND' and exported_glass['pbrMetallicRoughness']['baseColorFactor'][3]<.2
re=bpy.data.scenes.new('SERVER_GLb_REIMPORT_CHECK')
bpy.context.window.scene=re
bpy.ops.import_scene.gltf(filepath=str(out/'server_room.glb'))
bpy.context.view_layer.update()
re_meshes=[ob for ob in re.objects if ob.type=='MESH']
# Imports get Blender suffixes because the source scene is preserved.
roundtrip={}
for ob in re_meshes:
    key=ob.name
    if key not in source: key=key.rsplit('.',1)[0]
    row=signature(ob)
    row['materials']=[name if name in source[key]['materials'] else name.rsplit('.',1)[0] for name in row['materials']]
    roundtrip[key]=row
checks['reimport_meshes_match']=set(source)==set(roundtrip)
checks['reimport_bounds_match']=all(max(abs(a-b) for ar,br in zip(source[n]['bounds'],roundtrip[n]['bounds']) for a,b in zip(ar,br))<.001 for n in source)
checks['reimport_matrices_match']=all(max(abs(a-b) for a,b in zip(source[n]['matrix'],roundtrip[n]['matrix']))<.001 for n in source)
checks['reimport_materials_match']=all(source[n]['materials']==roundtrip[n]['materials'] for n in source)
if boards:
    def uv_mapping(ob):
        # glTF triangulates quads and may reorder loops. Compare UVs at world
        # positions rather than loop indices; retain duplicate seams as pairs.
        return {tuple(round(v,5) for v in ob.matrix_world@ob.data.vertices[loop.vertex_index].co)+
                tuple(round(v,5) for v in ob.data.uv_layers.active.data[loop.index].uv)
                for loop in ob.data.loops}
    imported_boards=[next(r for r in re_meshes if r.name.rsplit('.',1)[0]==ob.name or r.name==ob.name) for ob in board_objects]
    checks['reimport_whiteboard_uvs_match']=all(uv_mapping(a)==uv_mapping(b) for a,b in zip(board_objects,imported_boards))
    checks['reimport_whiteboards_face_room']=all(p.normal.dot(Vector((0,-1,0)))>.999 for ob in imported_boards for p in ob.data.polygons)
bpy.context.window.scene=scene
report={'stage':'architectural_draft','blender_version':bpy.app.version_string,
        'checks':checks,'automatic_checks_pass':all(checks.values()),
        'window_counts':window_counts,'reserved_volume_overlaps':overlaps,
        'mesh_count':len(meshes),'exported_nodes':len(names),
        'glb_sha256':hashlib.sha256(blob).hexdigest(),
        'not_run':['integrazione applicativa','navigazione runtime','approvazione artistica di Juri'],
        'ready_for_final_delivery':False}
(out/'DRAFT_CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('DRAFT_CHECKS',json.dumps(report),flush=True)
if not all(checks.values()):raise RuntimeError(str([k for k,v in checks.items() if not v]))
views=out/'views';views.mkdir(exist_ok=True)
original_camera=scene.camera
labels=('overview','rack_detail','aisle','top') if racks else ('interior','reverse','top')
if ventilation:labels=('overview','ventilation','top')
if partition:labels=('overview','entrance','keypad','top')
if operations:labels=('overview','operations','maintenance','top')
if manifest.get('architectural_junctions'):labels=('overview','operations','maintenance','junction','corner_south_east','corner_south_west')
for label in labels:
    scene.camera=scene.objects[prefix+'preview_'+label]
    ceiling=list(scene.objects[prefix+'ceiling'].children_recursive)
    prior={ob:ob.hide_render for ob in ceiling}
    if label in ('top','overview') or label.startswith('corner_'):
        for ob in ceiling:ob.hide_render=True
    scene.render.filepath=str(views/(label+'.png'))
    bpy.ops.render.render(write_still=True)
    for ob,value in prior.items():ob.hide_render=value
scene.camera=original_camera
print('VIEWS_COMPLETE',str(views),flush=True)
