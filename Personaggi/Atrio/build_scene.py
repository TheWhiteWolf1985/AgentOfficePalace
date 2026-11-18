"""Build local Concept 02 NPC review assets and original-Atrium fit views.

blender --background --factory-startup --python build_scene.py
Only work files are written. Original rooms and active deliveries stay intact.
"""
from pathlib import Path
import sys,json,hashlib,runpy,math,struct
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'resources'))
from support import *
from design import build_character
from inspect_character import inspect
from glb_common import parse
ASSETS=['reception_a','reception_b']
ROLES={r:'char_mat_'+r for r in ['skin','hair','eyebrows','iris','clothing','shirt','tie','pants','shoes','accent']}
ROLES.update(facial_dark='char_mat_dark',eye_and_teeth_white='char_mat_white')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write(path,obj):Path(path).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def aim(camera,pos,target,scale=None):
    camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    if scale:camera.data.ortho_scale=scale
def load(path):empty_scene();bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
def export_asset(path,asset):
    old=sys.argv[:]
    try:
        sys.argv=['export_character.py','--','--profile','human','--out',str(path)]
        runpy.run_path(str(RES/'export_character.py'),run_name='__main__')
    finally:sys.argv=old
    g,_=parse(path.read_bytes());manifest=json.loads((RES/'human.manifest.json').read_text(encoding='utf8'))
    root=bpy.data.objects['char_root']
    manifest.update(asset_id=asset+'_concept02_v01',file=path.name,sha256=sha(path),blender_version=bpy.app.version_string,
        license='Original design for Juri; scaffold/tools MIT, copyright 2026 AgentSystemLabs',
        design_revision='reception_concept02_v01',material_roles=dict(ROLES,**({'bow':'char_mat_bow'} if asset=='reception_a' else {'headband':'char_mat_headband'})),
        body_mesh_nodes=[n['name'] for n in g['nodes'] if 'mesh' in n],
        mesh_parents={o.name:o.parent.name for o in root.children_recursive if o.type=='MESH'},
        appearance='Warm peach porcelain face/hands/legs; ivory fitted jacket, dark blouse, cobalt trim, charcoal skirt, heels; blonde long hair with independently colored bow' if asset=='reception_a' else 'Warm peach porcelain face/hands/legs; ivory fitted jacket, dark blouse, cobalt trim, charcoal skirt, heels; brunette bob with independently colored headband',
        intended_use={'role':'decorative_reception_npc','profile':'human','pose':'standing_fixed','tasks':None,'ai':None,'movement':False,'connected_person':False},
        placement={'file':'reception.placements.json','asset_local_origin':[0,0,0],'asset_scale':[1,1,1],
            'instance_scale_only':1.15,'scale_not_baked':True},
        customization={'clothing':'ivory jacket only','shirt':'dark inner blouse and cuffs','tie':'small collar clasp',
            'pants':'skirt','shoes':'heels, independent from face','accent':'cobalt jacket piping',
            'hair':'one replaceable mesh under char_hair','eyebrows':'separate under char_head',
            'facial_dark':'pupils, outlines, smile and fine decorative cheek seam',
            'head_accessory':{'node':'char_bow_visual' if asset=='reception_a' else 'char_headband_visual','parent':'char_head','outside_hair':True,'independent_color':True}},
        deviations=[{'field':'materials/primitives','reason':'Independent color roles, cobalt trim, separate facial materials and head accessory; original budgets unchanged','approval':'NOT_RUN'}],
        checks={'artistic_approval':'PASS','approval_source':'Juri: Perfetto, 17 novembre 2026','application_QA':'NOT_RUN'})
    write(path.with_suffix('.manifest.json'),manifest)
    result=inspect(path.read_bytes(),CONTRACT,'human',manifest);write(path.with_suffix('.original_check.json'),result)
    return result
def imported_qa():
    errors=[]
    for name,c in CONTRACT['profiles']['human']['nodes'].items():
        o=bpy.data.objects.get(name);t=c['translation'];expected=Vector((t[0],-t[2],t[1]))
        if o is None:errors.append('missing '+name);continue
        if (o.parent.name if o.parent else None)!=c['parent']:errors.append('parent '+name)
        if (o.location-expected).length>1e-5:errors.append('translation '+name)
        if max(abs(v-1) for v in o.scale)>1e-5 or o.matrix_local.to_quaternion().angle>1e-5:errors.append('TRS '+name)
    root=bpy.data.objects['char_root'];meshes=[o for o in root.children_recursive if o.type=='MESH']
    if bpy.data.objects['char_eyebrows_visual'].parent.name!='char_head':errors.append('eyebrows parent')
    if bpy.data.objects['char_eyebrows_visual'] in bpy.data.objects['char_hair'].children_recursive:errors.append('eyebrows hidden with hair')
    accessory=bpy.data.objects.get('char_bow_visual') or bpy.data.objects.get('char_headband_visual')
    if accessory is None or accessory.parent.name!='char_head' or accessory in bpy.data.objects['char_hair'].children_recursive:errors.append('accessory parent')
    mats={m.name:m for o in meshes for m in o.data.materials}
    def node(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    initial={n:tuple(node(m).inputs['Base Color'].default_value) for n,m in mats.items()}
    for name,m in mats.items():
        node(m).inputs['Base Color'].default_value=(.85,.01,.52,1)
        if any(tuple(node(other).inputs['Base Color'].default_value)!=initial[n] for n,other in mats.items() if n!=name):errors.append('coupled '+name)
        node(m).inputs['Base Color'].default_value=initial[name]
    hidden={o for name in ['char_head','char_arm_negx','char_arm_posx'] for o in bpy.data.objects[name].children_recursive}
    remaining={o.name for o in meshes if o not in hidden}
    if remaining!={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual'}:errors.append('first person branches')
    poses={}
    for name in ['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name);poses[name]='PASS' if all(math.isfinite(v) for o in meshes for row in o.matrix_world for v in row) else 'FAIL'
    pose('rest')
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    return {'status':'FAIL' if errors else 'PASS','errors':errors,'hierarchy_TRS_scale':'PASS' if not errors else 'FAIL',
        'independent_color_edits':'PASS' if not any('coupled' in e for e in errors) else 'FAIL',
        'eyebrows_outside_hair':'PASS' if not any('eyebrows' in e for e in errors) else 'FAIL',
        'first_person_remaining':sorted(remaining),'finite_pose_tests':poses,
        'height_m':max(p.z for p in points)-min(p.z for p in points),
        'all_pose_intersections':'NOT_RUN','application_QA':'NOT_RUN'}
def single_views(asset):
    folder=HERE/'views'/asset;folder.mkdir(exist_ok=True)
    stage(900,1000);camera=camera_at('Review_camera',(3,-5,2.3),(0,0,.9),2.12)
    for name,pos in [('front',(0,-5,.9)),('side',(5,0,.9)),('back',(0,5,.9)),('three_quarter',(3,-5,2.3))]:
        aim(camera,pos,(0,0,.9),2.12);render(folder/(name+'.png'))
    aim(camera,(2,-5,1.65),(0,0,1.445),.94);render(folder/'face.png')
    for o in bpy.data.objects['char_hair'].children_recursive:o.hide_render=True
    render(folder/'without_hair.png')
    for o in bpy.data.objects['char_hair'].children_recursive:o.hide_render=False
    head=bpy.data.objects['char_head'];head.rotation_mode='XYZ';head.rotation_euler=(.15,.10,.30)
    render(folder/'head_rotation.png');head.rotation_euler=(0,0,0);bpy.context.view_layer.update()
    aim(camera,(3,-5,2.3),(0,0,.9),2.12)
    for name in ['walk_a','sit','hold','paper_book','ladder','pole']:
        pose(name);render(folder/('technical_pose_'+name+'.png'))
    pose('rest')
    for name in ['char_head','char_arm_negx','char_arm_posx']:
        for o in bpy.data.objects[name].children_recursive:o.hide_render=True
    render(folder/'first_person_visibility.png')
    for o in bpy.data.objects['char_root'].children_recursive:o.hide_render=False
    bpy.context.scene.name=asset+'_Concept02_Roundtrip'
    bpy.context.scene.render.filepath='//../views/'+asset+'/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(asset+'.reimport.blend')))
def add_npc(asset,index,placement=None):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(HERE/(asset+'.glb')))
    objects=set(bpy.data.objects)-before
    for o in objects:o.name=asset+'__'+o.name.split('.')[0]
    root=next(o for o in objects if o.parent not in objects)
    if placement:
        root.location=placement['blender_position'];root.scale=placement['runtime_instance_scale']
    else:root.location.x=(-.6 if index==0 else .6)
    bpy.context.view_layer.update();return root,objects
def reference_state(objects):
    h=hashlib.sha256()
    for o in sorted(objects,key=lambda o:o.name):
        h.update(o.name.encode());h.update(str(tuple(v for row in o.matrix_world for v in row)).encode())
        if o.type=='MESH':
            for v in o.data.vertices:h.update(struct.pack('<fff',*v.co))
            for p in o.data.polygons:h.update(str((tuple(p.vertices),p.material_index)).encode())
            for m in o.data.materials:
                h.update(m.name.encode());h.update(str(tuple(m.diffuse_color)).encode())
                if m.use_nodes:
                    for n in m.node_tree.nodes:
                        if n.type=='BSDF_PRINCIPLED':h.update(str(tuple(n.inputs['Base Color'].default_value)).encode())
    return h.hexdigest()
def pair_review():
    empty_scene()
    for i,asset in enumerate(ASSETS):add_npc(asset,i)
    stage(1500,1100);camera=camera_at('Concept02_Review_camera',(2.4,-7,2.55),(0,0,.89),2.9)
    render(HERE/'views/pair_three_quarter.png')
    aim(camera,(0,-7,.9),(0,0,.9),2.8);render(HERE/'views/pair_front.png')
    bpy.context.scene.render.resolution_y=650;aim(camera,(0,-7,1.44),(0,0,1.44),2.1);render(HERE/'views/faces.png')
    bpy.context.scene.render.resolution_y=1100;aim(camera,(2.4,-7,2.55),(0,0,.89),2.9)
    bpy.context.scene.name='Atrio_NPC_Concept02_Bionda_Castana'
    bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'npc_concept02.review.blend'))
def fit_review():
    placements=json.loads((RES/'reception.placements.json').read_text(encoding='utf8'))
    reference=RES/'atrium_reference.glb'
    if sha(reference)!=placements['source_atrium_sha256']:raise RuntimeError('Atrium SHA mismatch')
    empty_scene();bpy.ops.import_scene.gltf(filepath=str(reference));bpy.context.view_layer.update()
    original=set(bpy.data.objects);before=reference_state(original);npcs=[]
    for i,asset in enumerate(ASSETS):npcs.append(add_npc(asset,i,placements['placements'][i]))
    after=reference_state(original)
    stage(1500,1000,ground=False)
    for o in bpy.context.scene.objects:
        if o.type=='LIGHT' and o not in original:
            o.location.y+=7;o.location.z+=1;o.rotation_euler=(Vector((0,10.8,1.5))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy*=3
    camera=camera_at('Review_visitor',(0,5.5,1.4),(0,10.8,1.4),lens=42)
    render(HERE/'views/reception_from_visitor.png')
    eye_visibility={};deps=bpy.context.evaluated_depsgraph_get()
    for asset,(root,objects) in zip(ASSETS,npcs):
        checks={}
        for name,p in [('eye_negx',(-.12,-.310,1.414)),('eye_posx',(.12,-.310,1.414)),('smile',(0,-.306,1.28))]:
            target=root.matrix_world@Vector(p);delta=target-camera.location
            hit,location,normal,index,obj,matrix=bpy.context.scene.ray_cast(deps,camera.location,delta.normalized(),distance=delta.length+.02)
            checks[name]={'status':'PASS' if hit and (obj.original in objects or obj in objects) else 'FAIL','first_hit':obj.name if hit else None}
        eye_visibility[asset]=checks
    bpy.context.scene.name='Atrio_Concept02_Fit_Originale'
    bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'npc_concept02.fit.review.blend'))
    aim(camera,(0,7.2,1.6),(0,10.8,1.62));render(HERE/'views/reception_from_visitor_close.png')
    camera.data.lens=28;aim(camera,(0,5.5,1.4),(0,10.8,1.7));render(HERE/'views/reception_visitor_wide.png')
    write(HERE/'FIT_VALIDATION.json',{'asset_source_sha256':{a:sha(HERE/(a+'.glb')) for a in ASSETS},'original_reference_sha256':sha(reference),'source_matches_placements':'PASS',
        'reference_geometry_transforms_materials_unchanged':'PASS' if before==after else 'FAIL',
        'placements_applied_unmodified':True,'instance_scale_only':1.15,'asset_source_scale':1.0,
        'visitor_eye_height_m':1.4,'face_visibility_rays':eye_visibility,'ray_scope':'first visible surface belongs to the intended NPC; not a whole-body collision proof',
        'whole_body_furniture_intersections':'NOT_RUN','application_QA':'NOT_RUN'})
def main():
    global HERE
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=HERE);ap.add_argument('--skip-views',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    HERE=args.out.resolve();HERE.mkdir(parents=True,exist_ok=True);(HERE/'views').mkdir(exist_ok=True)
    if not bpy.app.background:raise RuntimeError('Use an isolated background Blender process')
    bpy.context.preferences.filepaths.save_version=0;reports={}
    shutil.copy2(RES/'reception.placements.json',HERE/'reception.placements.json')
    for asset in ASSETS:
        build_character(asset);bpy.context.scene.name=asset+'_Concept02_Source'
        path=HERE/(asset+'.glb');bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
        static=export_asset(path,asset);load(path);qa=imported_qa()
        reports[asset]={'source_sha256':sha(path),'original_validator':static,'roundtrip':qa}
        if not args.skip_views:single_views(asset)
        else:bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.reimport.blend')))
    write(HERE/'BUILD_REPORT.json',reports)
    if not args.skip_views:pair_review();fit_review()
    print('CONCEPT02_NPC_REVIEW_COMPLETE',str(HERE),flush=True)
if __name__=='__main__':main()
