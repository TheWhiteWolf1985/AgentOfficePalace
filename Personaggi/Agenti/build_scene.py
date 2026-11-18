"""Build and review Concept05 humanoid-agent drafts, without editing the app.

blender --background --factory-startup --python build_scene.py
Original AOP_CHAR_RIGID_1 constraints/validators are preserved unchanged.
"""
from pathlib import Path
import sys,json,hashlib,runpy,math,argparse
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'resources'))
from support import empty_scene,stage,camera_at,render,pose,CONTRACT,RES
from hair_runtime import STYLES,component,attach,export_root,preserve_body_normals
from appearance import make_look,COLORS
from inspect_character import inspect
from glb_common import parse
PROPOSAL=json.loads((HERE/'PROPOSED_AGENT_PROFILE.json').read_text(encoding='utf8'))
ASSETS=['agent_male_base','agent_female_base']
def write(p,o):Path(p).write_text(json.dumps(o,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def node(m):return next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
def setup_materials():
    for name in ['iris','eyebrows','mouth','status']:
        m=bpy.data.materials['char_mat_'+name];n=node(m)
        n.inputs['Emission Color'].default_value=n.inputs['Base Color'].default_value
        n.inputs['Emission Strength'].default_value=1.0 if name=='status' else .35
def role_map(asset):
    roles={n:'char_mat_'+n for n in ['skin','hair','eyebrows','iris','clothing','shirt','tie','pants','shoes','accent','mouth','status']}
    if asset=='agent_female_base':roles['bow']='char_mat_bow'
    roles.update(facial_dark='char_mat_dark',eye_and_teeth_white='char_mat_white',body='char_mat_skin')
    return roles
def export(path,asset,style,reference=None):
    old=sys.argv[:]
    try:
        sys.argv=['export_character.py','--','--profile','agent','--out',str(path)]
        runpy.run_path(str(RES/'export_character.py'),run_name='__main__')
    finally:sys.argv=old
    if reference:preserve_body_normals(path,reference)
    g,b=parse(path.read_bytes())
    if style=='bald' and not any(m['name']=='char_mat_hair' for m in g['materials']):
        from hair_runtime import save_glb
        from concept_style import PALETTE
        inactive=bpy.data.materials.get('char_mat_hair')
        color=list(node(inactive).inputs['Base Color'].default_value) if inactive else [*PALETTE['hair'],1]
        g['materials'].append({'name':'char_mat_hair','pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':.8}});save_glb(path,g,b)
    legacy=json.loads((RES/'agent.manifest.json').read_text(encoding='utf8'))
    legacy.update(asset_id=asset,file=path.name,sha256=sha(path),blender_version=bpy.app.version_string,
        license='Original design for Juri; MIT scaffold/tools, copyright 2026 AgentSystemLabs',material_roles={'body':'char_mat_skin','status':'char_mat_status'},
        body_mesh_nodes=[n['name'] for n in g['nodes'] if 'mesh' in n],deviations=[{'reason':'Human-size bodies with user-rig pivots requested; separate humanoid-agent proposal, not legacy agent conformity'}])
    original=inspect(path.read_bytes(),CONTRACT,'agent',legacy);write(path.with_suffix('.legacy_agent_check.json'),original)
    manifest=dict(legacy,contract=PROPOSAL['id'],contract_version=PROPOSAL['version'],profile='agent_humanoid_draft',nodes=PROPOSAL['nodes'],
        material_roles=role_map(asset),status='PROPOSED_NOT_APPROVED',source_contract='AOP_CHAR_RIGID_1',
        original_agent_profile_compatible=False,hairstyle={'active':style,'compatible':STYLES,'attach_to':'char_hair','translation':[0,0,0],'rotation':[0,0,0,1],'scale':[1,1,1]},
        customization={'same_user_color_roles':True,'pants':'trousers including upper torso part, or female skirt','clothing':'jacket only',
            'eyebrows':'outside hair under head','shoes':'independent from facial graphics','mouth':'new independent digital smile color',
            'status':'dedicated emissive char_mat_status, excluded from random appearance','fixed_bow':'female only, outside hair, independent color'},
        procedural_controls={'pupils':'children of each eye, local identity; move for gaze, eyes parent scale for blink','status':'small neutral chest indicator, separate control/material, no task or state text baked'},
        checks={'artistic_approval':'PASS','approval_source':'Juri: Bene, 17 novembre 2026; base design and shown examples','new_technical_contract_approval':'NOT_RUN','runtime_application':'NOT_RUN'})
    write(path.with_suffix('.manifest.json'),manifest);return original
def load(path):empty_scene();bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
def qa(path,asset):
    errors=[]
    for name,c in PROPOSAL['nodes'].items():
        o=bpy.data.objects.get(name);t=c['translation']
        if o is None:errors.append('missing '+name);continue
        if (o.parent.name if o.parent else None)!=c['parent']:errors.append('parent '+name)
        if (o.location-Vector((t[0],-t[2],t[1]))).length>1e-5:errors.append('translation '+name)
        if max(abs(v-1) for v in o.scale)>1e-5 or o.matrix_local.to_quaternion().angle>1e-5:errors.append('TRS '+name)
    roles=role_map(asset);mats={n:bpy.data.materials.get(n) for n in set(roles.values())}
    if any(m is None and not (name=='char_mat_hair' and not any(o.type=='MESH' for o in bpy.data.objects['char_hair'].children_recursive)) for name,m in mats.items()):errors.append('missing material')
    mats={n:m for n,m in mats.items() if m is not None}
    initial={n:tuple(node(m).inputs['Base Color'].default_value) for n,m in mats.items()}
    for name,m in mats.items():
        n=node(m);old=tuple(n.inputs['Emission Color'].default_value)
        n.inputs['Base Color'].default_value=(.8,.01,.5,1)
        n.inputs['Emission Color'].default_value=(.8,.01,.5,1) if name in ['char_mat_iris','char_mat_eyebrows','char_mat_mouth'] else old
        if any(tuple(node(other).inputs['Base Color'].default_value)!=initial[key] for key,other in mats.items() if key!=name):errors.append('coupled color '+name)
        n.inputs['Base Color'].default_value=initial[name];n.inputs['Emission Color'].default_value=old
    hair=bpy.data.objects['char_hair'];brows=bpy.data.objects['char_eyebrows_visual']
    if brows in hair.children_recursive or brows.parent.name!='char_head':errors.append('brows parent')
    if asset=='agent_female_base' and bpy.data.objects['char_bow_visual'].parent.name!='char_head':errors.append('bow parent')
    root=bpy.data.objects['char_root'];hidden={o for c in ['char_head','char_arm_negx','char_arm_posx'] for o in bpy.data.objects[c].children_recursive}
    remaining={o.name for o in root.children_recursive if o.type=='MESH' and o not in hidden}
    if remaining!={'char_torso_visual','char_leg_negx_visual','char_leg_posx_visual','char_status_visual'}:errors.append('first-person separation')
    for name in ['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']:
        pose(name)
        if not all(math.isfinite(v) for o in root.children_recursive for row in o.matrix_world for v in row):errors.append('pose '+name)
    pose('rest')
    for name in ['typing','waiting','glance','blink','raised','step','celebrate','squash']:
        agent_pose(name)
        if not all(math.isfinite(v) for o in root.children_recursive for row in o.matrix_world for v in row):errors.append('agent pose '+name)
    agent_pose('waiting')
    if node(bpy.data.materials['char_mat_status']).inputs['Emission Strength'].default_value<=0:errors.append('status not emissive')
    return {'functional_draft_status':'FAIL' if errors else 'PASS','errors':errors,'profile':'PROPOSED_NOT_APPROVED',
        'source_sha256':sha(path),'rig_and_material_checks':'PASS' if not errors else 'FAIL','first_person_remaining':sorted(remaining),
        'body_pose_finite_tests':8,'agent_pose_finite_tests':8,'all_pose_intersections':'NOT_RUN','application_QA':'NOT_RUN'}
def agent_pose(name):
    pose('rest');body=bpy.data.objects['char_body'];body.scale=(1,1,1)
    for side in ['negx','posx']:
        pupil=bpy.data.objects['char_pupil_'+side];pupil.location=(0,0,0);bpy.data.objects['char_eye_'+side].scale=(1,1,1)
    if name=='typing':
        for side in ['negx','posx']:bpy.data.objects['char_arm_'+side].rotation_euler.x=-1.1
    elif name=='glance':
        for side in ['negx','posx']:bpy.data.objects['char_pupil_'+side].location=(.012,0,.006)
    elif name=='blink':
        for side in ['negx','posx']:bpy.data.objects['char_eye_'+side].scale.z=.08
    elif name=='raised':pose('ladder')
    elif name=='step':pose('walk_a')
    elif name=='celebrate':pose('ladder');body.scale=(1.025,1.025,1.025)
    elif name=='squash':body.scale=(1.05,1.05,.90)
    bpy.context.view_layer.update()
def aim(cam,pos,target,scale):cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
def views(asset):
    folder=HERE/'views'/asset;folder.mkdir(exist_ok=True);stage(850,1000);cam=camera_at('Review_camera',(3,-5,2.3),(0,0,.9),2.12)
    for name,pos in [('front',(0,-5,.9)),('side',(5,0,.9)),('back',(0,5,.9)),('three_quarter',(3,-5,2.3))]:
        aim(cam,pos,(0,0,.9),2.12);render(folder/(name+'.png'))
    aim(cam,(2,-5,1.65),(0,0,1.445),.94);render(folder/'face.png')
    for o in bpy.data.objects['char_hair'].children_recursive:o.hide_render=True
    render(folder/'without_hair.png')
    for o in bpy.data.objects['char_hair'].children_recursive:o.hide_render=False
    for name in ['glance','blink']:agent_pose(name);render(folder/(name+'.png'))
    agent_pose('waiting');aim(cam,(3,-5,2.3),(0,0,.9),2.12)
    for name in ['typing','raised','squash']:agent_pose(name);render(folder/(name+'.png'))
    agent_pose('waiting')
    for c in ['char_head','char_arm_negx','char_arm_posx']:
        for o in bpy.data.objects[c].children_recursive:o.hide_render=True
    render(folder/'first_person_visibility.png')
    for o in bpy.data.objects['char_root'].children_recursive:o.hide_render=False
    bpy.context.scene.name=asset+'_Roundtrip_Draft';bpy.context.scene.render.filepath='//../views/'+asset+'/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'assets'/(asset+'.reimport.blend')))
def apply_look(look):
    attach(look['hairstyle'],HERE/'hair')
    for role,color in look['colors'].items():
        m=bpy.data.materials.get('char_mat_'+role)
        if not m:continue
        n=node(m);n.inputs['Base Color'].default_value=(*color,1);m.diffuse_color=(*color,1)
        if role in ['iris','eyebrows','mouth']:
            n.inputs['Emission Color'].default_value=(*color,1);n.inputs['Emission Strength'].default_value=.35
def review():
    empty_scene()
    for i,asset in enumerate(ASSETS):
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(HERE/'assets'/(asset+'.glb')))
        objects=set(bpy.data.objects)-before
        for o in objects:o.name=asset+'__'+o.name.split('.')[0]
        root=next(o for o in objects if o.parent is None);root.location.x=-.6 if i==0 else .6
    stage(1500,1100);camera_at('Review_camera',(2.4,-7,2.55),(0,0,.89),2.85);render(HERE/'views/agent_pair.png')
    bpy.context.scene.name='Agenti_Concept05_Uomo_Donna_Bozza';bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'agents_concept05.review.blend'))
def sample_reviews(skip_views=False):
    samples=[]
    for i,style in enumerate(['short','long','bun','curly','ponytail','bald']):
        asset=ASSETS[i%2]
        for trial in range(1000):
            look=make_look('office-agent-'+str(i)+'-'+str(trial),asset)
            if look['hairstyle']==style:break
        samples.append(look);load(HERE/'assets'/(asset+'.glb'));apply_look(look)
        path=HERE/'assets'/('sample_'+str(i)+'.glb');export(path,asset,look['hairstyle'],HERE/'assets'/(asset+'.glb'))
        manifest=json.loads(path.with_suffix('.manifest.json').read_text(encoding='utf8'));manifest['appearance_sample']=look;write(path.with_suffix('.manifest.json'),manifest)
        if not skip_views:stage(600,700);camera_at('Sample_camera',(3,-5,2.3),(0,0,.9),2.12);render(HERE/'views'/('sample_'+str(i)+'.png'))
    write(HERE/'SAMPLE_LOOKS.json',samples)
    if skip_views:return
    empty_scene()
    for i in range(6):
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(HERE/'assets'/('sample_'+str(i)+'.glb')))
        imported=set(bpy.data.objects)-before
        for o in imported:o.name='sample_'+str(i)+'__'+o.name.split('.')[0]
        root=next(o for o in imported if o.parent is None);root.location.x=(i-2.5)*1.08
    stage(1900,700);camera_at('Variation_review_camera',(1.1,-14,3.3),(0,0,.9),7.0);render(HERE/'views/random_variants.png')
    bpy.context.scene.name='Agenti_Concept05_Esempi_Personalizzazione';bpy.context.scene.render.filepath='//views/'
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'agents_variations.review.blend'))
def main():
    global HERE
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=HERE);ap.add_argument('--skip-views',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    HERE=args.out.resolve();HERE.mkdir(parents=True,exist_ok=True)
    for name in ['assets','hair','views']:(HERE/name).mkdir(exist_ok=True)
    if not bpy.app.background:raise RuntimeError('Run in isolated background Blender')
    bpy.context.preferences.filepaths.save_version=0
    for style in STYLES:
        root=component(style);p=HERE/'hair'/('hair_'+style+'.glb');export_root(p,root);bpy.ops.wm.save_as_mainfile(filepath=str(p.with_suffix('.blend')))
    reports={}
    for asset in ASSETS:
        from male_design import build_character as male
        from female_design import build_character as female
        (male if asset=='agent_male_base' else female)();setup_materials()
        root=bpy.data.objects['char_root'];root['asset_id']=asset;root['contract']=PROPOSAL['id'];root['profile']='agent_humanoid_draft'
        root['status']='PROPOSED_NOT_APPROVED';root['intended_instance_scale']=1.0
        bpy.context.scene.name=asset+'_Source_Draft';path=HERE/'assets'/(asset+'.glb')
        bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
        original=export(path,asset,'short' if asset=='agent_male_base' else 'long')
        load(path);q=qa(path,asset);reports[asset]={'original_agent_profile':original,'draft_checks':q}
        if not args.skip_views:views(asset)
        else:bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.reimport.blend')))
    write(HERE/'DRAFT_VALIDATION.json',reports)
    write(HERE/'APPEARANCE_CATALOG.json',{'status':'DRAFT','bases':ASSETS,'hairstyles':STYLES,'material_palettes_linear_rgb':COLORS,
        'material_roles':{a:role_map(a) for a in ASSETS},'excluded_from_random':['status','facial_dark','eye_and_teeth_white'],
        'color_update_rule':'Update baseColorFactor and emissiveFactor = color * 0.35 for iris/eyebrows/mouth. Clone materials per instance.',
        'runtime_randomization':'NOT_RUN'})
    sample_reviews(args.skip_views)
    if not args.skip_views:review()
    print('AGENT_PACKAGE_BUILD_COMPLETE',flush=True)
if __name__=='__main__':main()
