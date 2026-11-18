"""Blender roundtrip QA; execution evidence, not application/controller certification."""
import bpy, sys, json, math, argparse
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_scene import pose, empty_scene, write_json

def bounds(objects):
    points=[o.matrix_world@Vector(p) for o in objects if o.type=='MESH' for p in o.bound_box]
    return [[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]]

def overlap(a,b):
    return all(min(a[1][i],b[1][i])-max(a[0][i],b[0][i])>1e-5 for i in range(3))

def check_asset(out,asset):
    empty_scene()
    bpy.ops.import_scene.gltf(filepath=str(out/(asset+'.glb')))
    result={}
    for name in ['walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        controls=[bpy.data.objects[n] for n in ['char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx']]
        moved=any(o.matrix_local.to_quaternion().angle>.1 for o in controls)
        finite=all(math.isfinite(v) for o in bpy.data.objects for row in o.matrix_world for v in row)
        result[name]={'status':'PASS' if moved and finite else 'FAIL','rotated':moved,'finite':finite}
        if name in ['ladder','pole']:
            head=bounds([bpy.data.objects['char_head'],*bpy.data.objects['char_head'].children_recursive])
            for side in ['negx','posx']:
                arm=bpy.data.objects['char_arm_'+side]
                result[name]['head_clearance_'+side]='FAIL' if overlap(head,bounds(arm.children_recursive)) else 'PASS'
    pose('rest')
    hide_controls=['char_head','char_arm_negx','char_arm_posx']
    hidden=[c for n in hide_controls for c in bpy.data.objects[n].children_recursive if c.type=='MESH']
    for o in hidden:o.hide_render=True
    remaining=[o.name for o in bpy.data.objects if o.type=='MESH' and not o.hide_render]
    result['hide_head_and_arms']={'status':'PASS' if set(remaining)=={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'} else 'FAIL','remaining':remaining}
    for o in hidden:o.hide_render=False
    materials=[m for m in bpy.data.materials if m.name.startswith('char_mat_')]
    pbr=all(any(n.type=='BSDF_PRINCIPLED' for n in m.node_tree.nodes) for m in materials)
    result['pbr_materials']={'status':'PASS' if len(materials)==8 and pbr else 'FAIL','count':len(materials)}
    return result

def instances(out):
    empty_scene(); roots=[]
    for asset in ['reception_a','reception_b']:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(out/(asset+'.glb')))
        added=set(bpy.data.objects)-before
        roots.append(next(o for o in added if o.parent not in added))
    groups=[{m for o in r.children_recursive if o.type=='MESH' for m in o.data.materials} for r in roots]
    isolated=not groups[0].intersection(groups[1])
    arms=[next(o for o in r.children_recursive if o.name.startswith('char_arm_negx') and o.type=='EMPTY') for r in roots]
    before=arms[1].matrix_local.copy()
    arms[0].rotation_mode='XYZ';arms[0].rotation_euler.x=.7
    bpy.context.view_layer.update()
    independent=all(abs(arms[1].matrix_local[i][j]-before[i][j])<1e-7 for i in range(4) for j in range(4))
    return {'status':'PASS' if isolated and independent else 'FAIL','distinct_material_datablocks':isolated,
            'independent_control_rotation':independent,'scope':'Blender two-import check only; runtime materials still require per-instance cloning.'}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True)
    a=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    result={asset:check_asset(a.out,asset) for asset in ['reception_a','reception_b']}
    result['two_instances']=instances(a.out)
    write_json(a.out/'BLENDER_QA.json',result)
    print(json.dumps(result))
    # Additional facial evidence from the reimported pair, without modifying its file.
    bpy.ops.wm.open_mainfile(filepath=str(a.out/'pair_review.blend'))
    scene=bpy.context.scene
    scene.render.resolution_y=600
    scene.camera.location=(0,-6,1.43)
    scene.camera.rotation_euler=(Vector((0,0,1.43))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale=2.15
    scene.render.filepath=str(a.out/'views/faces_closeup.png')
    bpy.ops.render.render(write_still=True)
