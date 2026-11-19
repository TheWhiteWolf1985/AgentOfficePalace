"""Impronta dell'asset Blender: geometria, normali, UV, materiali, nodi e trasformazioni."""
from pathlib import Path
import argparse
import hashlib
import json
import sys
import bpy


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf8')).hexdigest()


def simple(value):
    if isinstance(value,float):return round(value,6)
    if isinstance(value,(str,int,bool)) or value is None:return value
    if hasattr(value,'items'):return {str(k):simple(v) for k,v in value.items()}
    try:return [simple(v) for v in value]
    except TypeError:return str(value)


def fingerprint(scene):
    root=next(o for o in scene.objects if o.name=='server_v12_root')
    objects=[root]+list(root.children_recursive)
    mesh_cache={};materials={};rows=[]
    for ob in sorted(objects,key=lambda o:o.name):
        row={'name':ob.name,'type':ob.type,'parent':ob.parent.name if ob.parent else None,
             'matrix_world':simple([list(v) for v in ob.matrix_world]),
             'properties':{k:simple(v) for k,v in ob.items()}}
        if ob.type=='MESH':
            assert not ob.modifiers,'Valutare esplicitamente i modificatori prima del confronto: '+ob.name
            me=ob.data;key=me.as_pointer()
            if key not in mesh_cache:
                shape={'vertices':[simple(v.co) for v in me.vertices],
                       'polygons':[(list(p.vertices),p.material_index,p.use_smooth) for p in me.polygons],
                       'loop_vertices':[v.vertex_index for v in me.loops],
                       'corner_normals':[simple(v.vector) for v in me.corner_normals],
                       'uvs':{uv.name:[simple(v.uv) for v in uv.data] for uv in me.uv_layers}}
                mesh_cache[key]=digest(shape)
            row['geometry_sha256']=mesh_cache[key]
            row['materials']=[m.name for m in me.materials]
            for m in me.materials:
                if m.name in materials:continue
                sh=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
                materials[m.name]={'inputs':{k:simple(sh.inputs[k].default_value) for k in
                    ('Base Color','Metallic','Roughness','Alpha','Emission Color','Emission Strength')},
                    'viewport_color':simple(m.diffuse_color),'surface_render_method':m.surface_render_method,
                    'backface_culling':m.use_backface_culling,
                    'images':[n.image.name for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]}
        rows.append(row)
    content={'units':scene.unit_settings.scale_length,'root':root.name,'objects':rows,'materials':materials}
    return {'sha256':digest(content),'node_count':len(rows),'mesh_objects':sum(o.type=='MESH' for o in objects),
            'unique_meshes':len(mesh_cache),'blender_version':bpy.app.version_string,'asset':content}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--export-glb',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    result=fingerprint(bpy.context.scene)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    if args.export_glb:
        root=bpy.context.scene.objects['server_v12_root']
        for s in bpy.data.scenes:
            for layer in s.view_layers:
                for ob in layer.objects:ob.select_set(False,view_layer=layer)
        for ob in [root]+list(root.children_recursive):ob.hide_set(False);ob.select_set(True)
        bpy.context.view_layer.objects.active=root
        props=bpy.ops.export_scene.gltf.get_rna_type().properties
        kwargs={'filepath':str(args.export_glb),'export_format':'GLB','use_selection':True,
                'export_extras':True,'export_cameras':False,'export_lights':False,
                'export_apply':True,'export_yup':True}
        bpy.ops.export_scene.gltf(**{k:v for k,v in kwargs.items() if k in props})
    print(json.dumps({k:v for k,v in result.items() if k!='asset'}),flush=True)
