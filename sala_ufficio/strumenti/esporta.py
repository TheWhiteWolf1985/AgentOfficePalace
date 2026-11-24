"""Blender -b ufficio.blend -P strumenti/esporta.py -- <cartella-pacchetto>"""
import bpy, json, sys, re
from pathlib import Path

def export_all(root):
    root=Path(root)
    geo=root/'geometria';(geo/'varianti').mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene
    states=[]
    def unlock(layer):
        states.append((layer,layer.hide_viewport,layer.exclude));layer.exclude=False;layer.hide_viewport=False
        for c in layer.children:unlock(c)
    unlock(bpy.context.view_layer.layer_collection)
    cols=[(c,c.hide_viewport,c.hide_render) for c in bpy.data.collections]
    objects=[(o,o.hide_viewport,o.hide_get(),o.hide_select) for o in scene.objects]
    for c,_,_ in cols:c.hide_viewport=False;c.hide_render=False
    for o,_,_,_ in objects:o.hide_viewport=False;o.hide_select=False;o.hide_set(False)
    op=bpy.ops.export_scene.gltf
    properties=op.get_rna_type().properties
    args={'export_format':'GLB','use_selection':True,'export_extras':True,
          'export_yup':True,'export_cameras':False,'export_lights':False,
          'export_animations':False,'export_apply':False}
    args={k:v for k,v in args.items() if k in properties}
    formats=[i.identifier for i in properties['export_format'].enum_items]
    if formats:assert 'GLB' in formats
    groups={'ufficio_base':bpy.data.collections['UFFICIO | Base']}
    groups.update({c.name:c for c in bpy.data.collections['VARIANTI | Attivare singolarmente'].children})
    result={}
    original_names={o:o.name for o in scene.objects}
    def canonical(name):
        return re.sub(r'(desk-\d+(?:__(?:chair|seatAnchor|laptopAnchor|stage))?)\.\d+$',r'\1',name)
    try:
        for name,col in groups.items():
            selected=list(col.all_objects)
            for i,o in enumerate(scene.objects):o.name=f'__AOP_EXPORT_TEMP_{i}'
            for o in selected:o.name=canonical(original_names[o])
            for o in scene.objects:o.select_set(False)
            for o in selected:o.select_set(True)
            path=geo/'ufficio_base.glb' if name=='ufficio_base' else geo/'varianti'/f'{name}.glb'
            assert op(filepath=str(path),**args)=={'FINISHED'},name
            result[name]={'file':path.relative_to(root).as_posix(),
                          'objects':[o.name for o in col.all_objects]}
            for i,o in enumerate(scene.objects):o.name=f'__AOP_RESTORE_TEMP_{i}'
            for o,original_name in original_names.items():o.name=original_name
    finally:
        for i,o in enumerate(scene.objects):o.name=f'__AOP_FINAL_TEMP_{i}'
        for o,original_name in original_names.items():o.name=original_name
        for o,h,g,select in objects:o.select_set(False);o.hide_viewport=h;o.hide_set(g);o.hide_select=select
        for c,h,r in cols:c.hide_viewport=h;c.hide_render=r
        for layer,h,e in reversed(states):layer.hide_viewport=h;layer.exclude=e
    (root/'riferimenti/GRUPPI_EXPORT.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    return result

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    print(json.dumps(export_all(Path(args[0]).resolve()),ensure_ascii=False))
