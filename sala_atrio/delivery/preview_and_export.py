"""Esporta e controlla la bozza, reimporta il GLB e renderizza due viste.

blender --background work/v03/atrium.blend --python work/preview_and_export.py
I report riguardano la bozza: non certificano integrazione o navigazione.
"""
from pathlib import Path
import json
import struct
import hashlib
import bpy
from mathutils import Vector

scene=bpy.context.scene
assert scene.name.startswith('AOP_Sala_Atrio_'),scene.name
bpy.context.window.scene=scene
output=Path(bpy.data.filepath).resolve().parent
views=output/'views';views.mkdir(exist_ok=True)
root=bpy.data.objects['atrio_root']
objects=[root]+list(root.children_recursive)
deps=bpy.context.evaluated_depsgraph_get()

def bounds(o):
    return [o.matrix_world@Vector(v) for v in o.evaluated_get(deps).bound_box]

meshes=[o for o in objects if o.type=='MESH']
points=[p for o in meshes for p in bounds(o)]
lo=[min(p[i] for p in points) for i in range(3)]
hi=[max(p[i] for p in points) for i in range(3)]
overlaps=[]
for o in meshes:
    p=bounds(o);mn=[min(v[i] for v in p) for i in range(3)];mx=[max(v[i] for v in p) for i in range(3)]
    if all(min(mx[i],b)-max(mn[i],a)>.001 for i,(a,b) in enumerate([(7.2,9.8),(10.6,13.31),(-.3,5.41)])):
        overlaps.append(o.name)
checks={
    'root_identity':list(root.location)==[0,0,0] and list(root.scale)==[1,1,1],
    'metric_scale':scene.unit_settings.scale_length==1,
    'external_xy_bounds':lo[0]>=-18.301 and hi[0]<=18.301 and lo[1]>=-13.301 and hi[1]<=13.301,
    'floor_above_minimum':lo[2]>=-.301,
    'reception_centered':bpy.data.objects['atrio_reception_top'].location.x==0,
    'stairs_left':all(p.x<0 for o in bpy.data.objects['atrio_stairs'].children_recursive if o.type=='MESH' for p in bounds(o)),
    'stairs_30_treads':len([o for o in objects if '_tread_' in o.name])==30,
    'elevator_reserved_bbox_clear':not overlaps,
    'no_elevator_construction':not any('elevator' in o.name for o in objects),
}
if scene.name.endswith('v03'):
    logo=bpy.data.objects['atrio_company_logo_surface']
    checks['old_brand_text_removed']=not any(o.name in ['atrio_brand','atrio_brand_palace'] for o in objects)
    checks['blank_logo_quad_uv']=len(logo.data.vertices)==4 and len(logo.data.polygons)==1 and len(logo.data.uv_layers)==1
    checks['logo_has_no_image']=not any(n.type=='TEX_IMAGE' for n in logo.data.materials[0].node_tree.nodes)
    manifest=json.loads((output/'atrium.manifest.json').read_text(encoding='utf-8'))
    boxes=manifest['enrichment']['colliders']
    checks['central_entrance_aisle_clear']=not any(
        min(r['max_blender_m'][0],2.4)-max(r['min_blender_m'][0],-2.4)>.001 and
        min(r['max_blender_m'][1],1.2)-max(r['min_blender_m'][1],-13)>.001
        for r in boxes)
hidden={o.name:o.hide_get() for o in objects}
for s in bpy.data.scenes:
    for layer in s.view_layers:
        for o in layer.objects:o.select_set(False,view_layer=layer)
for o in objects:
    o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=root
props=bpy.ops.export_scene.gltf.get_rna_type().properties
kwargs={'filepath':str(output/'atrium.glb'),'export_format':'GLB','use_selection':True,
        'export_extras':True,'export_cameras':False,'export_lights':False,'export_apply':True}
kwargs={k:v for k,v in kwargs.items() if k in props}
bpy.ops.export_scene.gltf(**kwargs)
for o in objects:o.hide_set(hidden[o.name])
blob=(output/'atrium.glb').read_bytes()
magic,version,length=struct.unpack_from('<4sII',blob)
chunklen,chunktype=struct.unpack_from('<II',blob,12)
doc=json.loads(blob[20:20+chunklen].decode('utf-8'))
node_names={n.get('name') for n in doc.get('nodes',[])}
checks.update({
    'glb2_header':magic==b'glTF' and version==2 and length==len(blob),
    'embedded_buffers':all('uri' not in b for b in doc.get('buffers',[])),
    'embedded_images':all('uri' not in i for i in doc.get('images',[])),
    'no_required_extensions':not doc.get('extensionsRequired'),
    'nodes_present':all(o.name in node_names for o in objects),
    'no_preview_or_guides':not any(n and ('preview' in n or 'guide_' in n) for n in node_names),
    'no_exported_cameras_or_lights':not doc.get('cameras') and 'KHR_lights_punctual' not in doc.get('extensions',{}),
})
# Reimportazione reale: confronto trasformazioni, ingombri e materiali.
re=bpy.data.scenes.new('ATRIO_GLb_REIMPORT_CHECK')
bpy.context.window.scene=re
bpy.ops.import_scene.gltf(filepath=str(output/'atrium.glb'))
bpy.context.view_layer.update()
re_mesh=[o for o in re.objects if o.type=='MESH']
rp=[o.matrix_world@Vector(v) for o in re_mesh for v in o.bound_box]
rlo=[min(p[i] for p in rp) for i in range(3)];rhi=[max(p[i] for p in rp) for i in range(3)]
checks['reimport_bounds_match']=max(abs(a-b) for a,b in zip(lo+hi,rlo+rhi))<.002
checks['reimport_mesh_count']=len(re_mesh)==len(meshes)
source_materials={m.name for o in meshes for m in o.data.materials}
re_materials={m.name.removesuffix('.001') for o in re_mesh for m in o.data.materials}
checks['reimport_materials_match']=source_materials==re_materials
bpy.context.window.scene=scene
report={'stage':'visual_draft','blender_version':bpy.app.version_string,'checks':checks,
        'automatic_checks_pass':all(checks.values()),'bounds_blender_m':{'min':lo,'max':hi},
        'reserved_bbox_overlaps':overlaps,'glb_bytes':len(blob),'glb_sha256':hashlib.sha256(blob).hexdigest(),
        'nodes':len(node_names),'source_meshes':len(meshes),'reimport_meshes':len(re_mesh),
        'reimport_bounds_blender_m':{'min':rlo,'max':rhi},
        'manual_review':'Viste da osservare dopo il render; approvazione del design in corso con Juri.',
        'not_tested':['navigazione runtime','interazioni','integrazione applicativa','normativa scale'],
        'ready_for_final_delivery':False}
(output/'DRAFT_CHECKS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('DRAFT_CHECKS',json.dumps(report),flush=True)
# Salva una prova reimportata distinta, senza sovrascrivere il sorgente.
bpy.ops.wm.save_as_mainfile(filepath=str(output/'reimport_check.blend'),copy=True)
render_script=Path(__file__).resolve().parent/'render_views.py'
exec(compile(render_script.read_text(encoding='utf-8'),str(render_script),'exec'),
     {'__file__':str(render_script),'__name__':'__main__'})
if not all(checks.values()):
    raise RuntimeError('Verifiche bozza fallite: '+str([k for k,v in checks.items() if not v]))
