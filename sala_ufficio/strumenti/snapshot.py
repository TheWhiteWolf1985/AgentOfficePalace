"""Impronta visiva canonica: geometria, normali, UV, materiali e immagini."""
import bpy, hashlib, json

def fingerprint(collection):
    def q(values):return [round(float(v),6) for v in values]
    rows=[];materials=set()
    for o in collection.all_objects:
        if o.type!='MESH':continue
        materials.update(m for m in o.data.materials if m)
        rows.append({'name':o.name,'matrix':[q(r) for r in o.matrix_world],
            'v':[q(v.co) for v in o.data.vertices],
            'f':[list(p.vertices) for p in o.data.polygons],
            'normal':[q(p.normal) for p in o.data.polygons],
            'ids':[p.material_index for p in o.data.polygons],
            'm':[m.name if m else None for m in o.data.materials],
            'uv':[[q(x.uv) for x in layer.data] for layer in o.data.uv_layers]})
    shaders=[]
    for m in sorted(materials,key=lambda x:x.name):
        nodes=[]
        for n in m.node_tree.nodes if m.use_nodes else []:
            node={'type':n.type}
            if n.type=='TEX_IMAGE' and n.image:
                node['image']=n.image.name
                if n.image.packed_file:node['pixels']=hashlib.sha256(n.image.packed_file.data).hexdigest()
            values={}
            for socket in n.inputs:
                if socket.is_linked or not hasattr(socket,'default_value'):continue
                value=socket.default_value
                if isinstance(value,(int,float)):values[socket.identifier]=round(float(value),6)
                elif hasattr(value,'__len__') and not isinstance(value,str):
                    try:values[socket.identifier]=q(value)
                    except (TypeError,ValueError):pass
            node['inputs']=values;nodes.append(node)
        shaders.append({'name':m.name,'nodes':nodes,'diffuse':q(m.diffuse_color)})
    data={'objects':sorted(rows,key=lambda x:x['name']),'materials':shaders}
    digest=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return {'sha256':digest,'mesh_objects':len(rows),'material_count':len(materials)}
