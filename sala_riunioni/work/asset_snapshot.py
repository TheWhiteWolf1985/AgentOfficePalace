"""Impronta della geometria esportabile, senza camere o guide di anteprima."""
import bpy,json,hashlib
from pathlib import Path

def snapshot(scene):
    root=scene.objects['aop_conference_room'];dg=bpy.context.evaluated_depsgraph_get();rows=[]
    for ob in sorted([root,*root.children_recursive],key=lambda x:x.name):
        row={'name':ob.name,'parent':ob.parent.name if ob.parent else None,'type':ob.type,
             'world_matrix':[[round(x,5) for x in r] for r in ob.matrix_world]}
        if ob.type=='MESH':
            ev=ob.evaluated_get(dg);me=ev.to_mesh()
            row['geometry_sha256']=hashlib.sha256(json.dumps({
                'vertices':[[round(x,5) for x in v.co] for v in me.vertices],
                'faces':[[*p.vertices,p.material_index] for p in me.polygons],
                'uv':[[round(x,5) for x in v.uv] for v in me.uv_layers.active.data] if me.uv_layers.active else [],
                'materials':[m.name for m in me.materials]},sort_keys=True).encode()).hexdigest()
            ev.to_mesh_clear()
        rows.append(row)
    return {'nodes':len(rows),'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest(),'objects':rows}

if __name__=='__main__':
    scene=bpy.data.scenes['AOP_Sala_Riunioni_v01'];bpy.context.window.scene=scene;bpy.context.view_layer.update()
    result=snapshot(scene)
    (Path(__file__).parent/'source_asset_snapshot.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'nodes':result['nodes'],'sha256':result['sha256']}))
