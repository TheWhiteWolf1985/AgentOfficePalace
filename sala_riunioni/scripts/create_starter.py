"""Eseguire nel Python di Blender: aggiunge guide e root vuoto, non una sala finita."""
from pathlib import Path
import json
import bpy

# Se esegui il testo nel Text Editor, imposta questo percorso alla cartella estratta.
KIT_ROOT = None

def locate_kit():
    if KIT_ROOT:
        p = Path(KIT_ROOT).expanduser().resolve()
    elif '__file__' in globals():
        p = Path(__file__).resolve().parent.parent
    else:
        raise RuntimeError('Impostare KIT_ROOT nel file prima di eseguirlo nel Text Editor')
    if not (p/'rules/constraints.json').is_file():
        raise RuntimeError('Cartella del kit non valida')
    return p

def main():
    kit = locate_kit()
    c = json.loads((kit/'rules/constraints.json').read_text(encoding='utf-8'))
    names = [c['root_node'], *c['asset_groups'], 'aop_reference_only', 'aop_collision_helpers']
    conflicts = [n for n in names if n in bpy.data.objects or n in bpy.data.collections]
    if conflicts:
        raise RuntimeError('Esistono gia oggetti/collezioni del kit; nessun reset automatico: '+', '.join(conflicts))
    workspace = bpy.data.collections.new('aop_kit_workspace')
    bpy.context.scene.collection.children.link(workspace)
    guides = bpy.data.collections.new('aop_reference_only')
    helpers = bpy.data.collections.new('aop_collision_helpers')
    workspace.children.link(guides)
    workspace.children.link(helpers)
    guides.hide_render = True
    helpers.hide_render = True
    def empty(name, parent=None, location=(0,0,0), collection=workspace):
        ob = bpy.data.objects.new(name, None)
        collection.objects.link(ob)
        ob.empty_display_type = 'PLAIN_AXES'
        ob.empty_display_size = 0.35
        ob.location = location
        ob.parent = parent
        return ob
    root = empty(c['root_node'])
    root['aop_asset_contract'] = c['contract_version']
    for name in c['asset_groups']:
        empty(name, parent=root)
    def wire_box(name, lo, hi, color):
        x0,y0,z0 = lo; x1,y1,z1 = hi
        verts=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
        edges=[(0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]
        me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,edges,[]);me.update()
        ob=bpy.data.objects.new(name,me);guides.objects.link(ob)
        ob.display_type='WIRE';ob.show_in_front=True;ob.color=(*color,1)
        ob['aop_guide_only']=True
        return ob
    b=c['design_xy_m']; e=c['elevator_reserved_xy_m']; height=c['reference_module_height_m']
    wire_box('ref_design_envelope',(b['min_x'],b['min_y'],0),(b['max_x'],b['max_y'],0),(0.15,0.4,0.8))
    wire_box('ref_elevator_reserved',(e['min_x'],e['min_y'],0),(e['max_x'],e['max_y'],height),(1,0.45,0.1))
    wire_box('ref_door',(7.8,10.6,0),(9.2,10.6,2.4),(0.1,0.8,0.5))
    wire_box('ref_door_clearance_soft',(7.2,8.6,0),(9.8,10.6,0),(0.1,0.7,0.4))
    wire_box('ref_avatar_size',(8.18,9.08,0),(8.82,9.72,1.7),(0.55,0.25,0.8))
    empty('ref_floor_origin',collection=guides)
    empty('ref_elevator_center',location=c['elevator_center_blender_m'],collection=guides)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1.0
    scene.unit_settings.length_unit='METERS'
    print('Scaffold creato; nessun oggetto preesistente cancellato e nessun .blend salvato automaticamente.')
    print('Solo riferimenti e gerarchia: lavagna, architettura, arredi e posti sono ancora da realizzare.')

if __name__=='__main__':
    main()
