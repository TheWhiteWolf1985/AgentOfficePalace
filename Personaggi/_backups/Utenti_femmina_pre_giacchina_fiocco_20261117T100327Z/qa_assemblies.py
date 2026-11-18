"""Actual Blender reimport tests for 14 base/style combinations.

Hair/face tests exclude intentional contact with the common scalp. Hair/body
BVH intersections are tested across all eight body poses and nine head poses.
"""
from pathlib import Path
import sys,math,argparse,json,hashlib
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from support import empty_scene,CONTRACT,pose,stage,camera_at,render,write_json,material
from hair_design import STYLES
from package_core import ROLES
HEADS={'neutral':(0,0,0),'yaw_neg':(0,0,-25),'yaw_pos':(0,0,25),
       'pitch_neg':(-15,0,0),'pitch_pos':(15,0,0),'roll_neg':(0,-10,0),'roll_pos':(0,10,0),
       'yaw_neg_pitch_neg':(-15,0,-25),'yaw_pos_pitch_pos':(15,0,25)}
POSE_NAMES=['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']

def bvh(objects,nose=False):
    vertices=[];polygons=[];labels=[]
    for obj in objects:
        if obj.type!='MESH':continue
        offset=len(vertices);points=[obj.matrix_world@v.co for v in obj.data.vertices]
        vertices.extend(points)
        for poly in obj.data.polygons:
            if nose:
                p=[points[i] for i in poly.vertices]
                if not all(abs(v.x)<.10 and v.y<-.299 and 1.31<v.z<1.41 for v in p):continue
            polygons.append(tuple(offset+i for i in poly.vertices));labels.append(obj.name)
    return (BVHTree.FromPolygons(vertices,polygons,all_triangles=False,epsilon=1e-7),labels) if polygons else (None,[])

def matrix_checks():
    errors=[]
    for name,d in CONTRACT['profiles']['human']['nodes'].items():
        obj=bpy.data.objects.get(name)
        if obj is None:errors.append('missing '+name);continue
        expected=Vector((d['translation'][0],-d['translation'][2],d['translation'][1]))
        if (obj.location-expected).length>1e-5:errors.append('translation '+name)
        if (obj.parent.name if obj.parent else None)!=d['parent']:errors.append('parent '+name)
        if max(abs(x-1) for x in obj.scale)>1e-5:errors.append('scale '+name)
        if obj.matrix_local.to_quaternion().angle>1e-5:errors.append('rotation '+name)
    return errors

def snapshot():
    return {m.name:tuple(next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].default_value)
            for m in bpy.data.materials if m.name in ROLES.values()}

def check_one(out,base,style,do_render=False):
    empty_scene();path=out/'assemblies'/(base+'_'+style+'.glb')
    bpy.ops.import_scene.gltf(filepath=str(path))
    root=bpy.data.objects['char_root'];head=bpy.data.objects['char_head'];hair=bpy.data.objects['char_hair']
    hair_objs=[o for o in hair.children_recursive if o.type=='MESH']
    errors=matrix_checks()
    if style=='bald' and bpy.data.materials.get('char_mat_hair') is None:
        material('char_mat_hair',(.30,.19,.082))
    colors=snapshot();channels={}
    for role,name in list(ROLES.items())[:9]:
        node=next(n for n in bpy.data.materials[name].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        node.inputs['Base Color'].default_value=(.82,.018,.55,1)
        now=snapshot();changed=[k for k in colors if colors[k]!=now[k]]
        channels[role]={'status':'PASS' if changed==[name] else 'FAIL','visible_geometry':not(role=='hair' and style=='bald')}
        node.inputs['Base Color'].default_value=colors[name]
    hidden=[]
    for control in ['char_head','char_arm_negx','char_arm_posx']:
        for obj in bpy.data.objects[control].children_recursive:
            if obj.type=='MESH':obj.hide_render=True;hidden.append(obj)
    remaining={o.name for o in root.children_recursive if o.type=='MESH' and not o.hide_render}
    first_person='PASS' if remaining=={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'} else 'FAIL'
    for obj in hidden:obj.hide_render=False
    brows=bpy.data.objects['char_eyebrows_visual']
    for o in hair_objs:o.hide_render=True
    bald_ok=not brows.hide_render and not bpy.data.objects['char_head_visual'].hide_render and brows.parent==head
    for o in hair_objs:o.hide_render=False
    face_objs=[bpy.data.objects[n] for n in ['char_eye_negx_visual','char_eye_posx_visual','char_eyebrows_visual','char_mouth_visual']]
    face_tree,_=bvh(face_objs);nose_tree,_=bvh([bpy.data.objects['char_head_visual']],nose=True)
    hair_tree,_=bvh(hair_objs)
    face_pairs=(hair_tree.overlap(face_tree) if hair_tree and face_tree else [])
    nose_pairs=(hair_tree.overlap(nose_tree) if hair_tree and nose_tree else [])
    body_objects=[o for o in root.children_recursive if o.type=='MESH' and any(o==bpy.data.objects[n] or o in bpy.data.objects[n].children_recursive for n in ['char_torso','char_arm_negx','char_arm_posx','char_leg_negx','char_leg_posx'])]
    trees={}
    if do_render:
        stage(480,480)
        camera_at('Review_camera',(3,-5,2.3),(0,0,.9),2.25)
    for name in POSE_NAMES:
        pose(name);trees[name]=bvh(body_objects)
        if do_render:render(out/'views/poses'/(base+'_'+style+'_'+name+'.png'))
    pose('rest')
    intersections=[];cases=0
    head.rotation_mode='XYZ'
    for head_name,angles in HEADS.items():
        head.rotation_euler=tuple(math.radians(a) for a in angles)
        bpy.context.view_layer.update();hair_tree,_=bvh(hair_objs)
        for pose_name,(body_tree,labels) in trees.items():
            cases+=1
            hits=hair_tree.overlap(body_tree) if hair_tree and body_tree else []
            if hits:intersections.append({'body_pose':pose_name,'head_pose':head_name,'objects':sorted({labels[j] for i,j in hits}),'triangle_pairs':len(hits)})
        if do_render and head_name in ['yaw_neg_pitch_neg','yaw_pos_pitch_pos']:
            render(out/'views/head'/(base+'_'+style+'_'+head_name+'.png'))
    head.rotation_euler=(0,0,0);bpy.context.view_layer.update()
    if do_render:
        render(out/'views/styles'/(base+'_'+style+'.png'))
    ok=not errors and not intersections and not face_pairs and not nose_pairs and first_person=='PASS' and bald_ok and all(x['status']=='PASS' for x in channels.values())
    return {'status':'PASS' if ok else 'FAIL','source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'rig_roundtrip_errors':errors,'color_channels':channels,'first_person_visibility':first_person,
            'head_and_brows_without_hair':'PASS' if bald_ok else 'FAIL','face_intersection_pairs':len(face_pairs),
            'nose_intersection_pairs':len(nose_pairs),'pose_head_cases':cases,'hair_body_intersections':intersections,
            'scalp_contact':'Intentional shared attachment, excluded from collision test; visible eyes/brows/mouth/nose are tested separately.'}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,required=True);ap.add_argument('--render',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=args.out.resolve()
    for d in ['poses','head','styles']:(out/'views'/d).mkdir(parents=True,exist_ok=True)
    results={}
    for base in ['male','female']:
        for style in STYLES:
            key=base+'_'+style;results[key]=check_one(out,base,style,args.render)
            write_json(out/'ASSEMBLY_QA.json',{'status':'PASS' if all(x['status']=='PASS' for x in results.values()) else 'FAIL',
                'tested_head_angles_degrees':HEADS,'scope':'Eight body poses crossed with nine head states for every base/style; original scalp contact excluded; application NOT_RUN.',
                'rendered':args.render,'assemblies':results})
            print('ASSEMBLY_QA',key,results[key]['status'],results[key]['hair_body_intersections'],flush=True)
    print('ASSEMBLY_QA_COMPLETED',out,flush=True)

if __name__=='__main__':main()
