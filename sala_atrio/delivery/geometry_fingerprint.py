"""Impronta della geometria valutata per confrontare live e ricostruzione."""
from pathlib import Path
import json
import hashlib
import bpy

def write_fingerprint(output):
    root=bpy.data.objects['atrio_root']
    bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get()
    rows=[]
    for ob in sorted([root]+list(root.children_recursive),key=lambda o:o.name):
        row={'name':ob.name,'parent':ob.parent.name if ob.parent else None,'type':ob.type,
             'world_matrix':[[round(v,6) for v in r] for r in ob.matrix_world]}
        if ob.type=='MESH':
            ev=ob.evaluated_get(deps);me=ev.to_mesh()
            def point(v):return tuple(round(x,5) for x in v)
            faces=sorted((tuple(sorted(point(me.vertices[i].co) for i in p.vertices)),
                          point(p.normal),p.material_index) for p in me.polygons)
            geo=json.dumps({'vertices':sorted(point(v.co) for v in me.vertices),'faces':faces},sort_keys=True)
            row['geometry_sha256']=hashlib.sha256(geo.encode()).hexdigest()
            row['materials']=[m.name for m in ob.data.materials]
            ev.to_mesh_clear()
        rows.append(row)
    output=Path(output)
    output.write_text(json.dumps(rows,sort_keys=True,indent=2),encoding='utf-8')
    print('GEOMETRY_FINGERPRINT',len(rows),hashlib.sha256(output.read_bytes()).hexdigest(),flush=True)

if __name__=='__main__':
    write_fingerprint(Path(bpy.data.filepath).parent/'geometry_fingerprint.json')
