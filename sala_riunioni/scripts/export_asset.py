"""Exporter Blender del solo asset; richiede una scena completa e il manifest compilato."""
from pathlib import Path
import argparse,json,sys,hashlib
import bpy
from mathutils import Vector

KIT_ROOT=None

def main():
    kit=Path(KIT_ROOT).resolve() if KIT_ROOT else Path(__file__).resolve().parent.parent
    if str(kit/'scripts') not in sys.path:sys.path.insert(0,str(kit/'scripts'))
    from validate_scene import validate
    c=json.loads((kit/'rules/constraints.json').read_text(encoding='utf-8'));dest=kit/'delivery';dest.mkdir(exist_ok=True)
    mp=dest/'conference_room.manifest.json'
    if not mp.exists():raise RuntimeError('Compilare il manifest in delivery/ prima di esportare')
    m=json.loads(mp.read_text(encoding='utf-8'));m['blender_version']=bpy.app.version_string
    report=validate(c,m);(dest/'scene_check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if not report['automatic_pass']:raise RuntimeError('Scena non valida; export interrotto senza sovrascrivere il GLB')
    root=bpy.data.objects[c['root_node']];objs=[root,*root.children_recursive]
    if bpy.context.object and bpy.context.object.mode!='OBJECT':raise RuntimeError('Passare in Object Mode prima di esportare')
    selected=list(bpy.context.selected_objects);active=bpy.context.view_layer.objects.active
    target=dest/'conference_room.glb'
    try:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            if ob.hide_get() or ob.hide_viewport:raise RuntimeError('Nodo asset nascosto: '+ob.name)
            ob.select_set(True)
        bpy.context.view_layer.objects.active=root
        supported={p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
        required={'filepath':str(target),'export_format':'GLB','use_selection':True,'export_yup':True,'export_texcoords':True,'export_cameras':False,'export_lights':False,'export_animations':False}
        absent=[k for k in required if k not in supported]
        if absent:raise RuntimeError('Exporter Blender non compatibile: parametri mancanti '+str(absent))
        if 'export_apply' in supported:required['export_apply']=True
        if 'export_extras' in supported:required['export_extras']=True
        result=bpy.ops.export_scene.gltf(**required)
        if 'FINISHED' not in result:raise RuntimeError('Export non completato')
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in selected:
            try:ob.select_set(True)
            except RuntimeError:pass
        bpy.context.view_layer.objects.active=active
    for row in m['seats']:
        ob=bpy.data.objects[row['anchor']];st=bpy.data.objects[row['stand']]
        row['position_blender_m']=list(ob.matrix_world.translation);row['stand_blender_m']=list(st.matrix_world.translation)
        row['facing_blender']=list((ob.matrix_world.to_3x3()@Vector((0,-1,0))).normalized())
    mats={mat.name:mat for ob in objs if ob.type=='MESH' for mat in ob.data.materials if mat}
    m['materials']=[{'name':n,'base_color_rgba':list(v.diffuse_color),'role':'dynamic_whiteboard' if n==c['whiteboard_material'] else 'static_design'} for n,v in sorted(mats.items())]
    m['stats']=report['stats'];m['stats']['glb_bytes']=target.stat().st_size;m['glb_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
    mp.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8')
    print('GLB esportato; salvare .blend, eseguire inspect_glb e completare review/reimport. Non e ancora una consegna validata.')

if __name__=='__main__':main()
