"""Export/reimport 14 combinations and test deterministic appearance data."""
from pathlib import Path
import sys,collections,json,bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from build_scene import *
from geometry_reader import Asset
from appearance import make_look,COLORS
def body(a):return collections.Counter((n,m,v,s) for n,m,v,s in a.triangles() if not a.ancestor(n,'char_hair'))
folder=HERE/'qa_assemblies';folder.mkdir(exist_ok=True);results={}
for asset in ASSETS:
    base=HERE/'assets'/(asset+'.glb');baseline=body(Asset(base))
    for style in STYLES:
        load(base);attach(style,HERE/'hair');path=folder/(asset+'_'+style+'.glb');export(path,asset,style,base)
        same=body(Asset(path))==baseline;load(path);q=qa(path,asset)
        q['non_hair_geometry_materials_unchanged']='PASS' if same else 'FAIL'
        q['one_active_hair']='PASS' if sum(o.type=='MESH' for o in bpy.data.objects['char_hair'].children_recursive)==(0 if style=='bald' else 1) else 'FAIL'
        results[asset+'_'+style]=q
    load(base);stage(500,500);camera=camera_at('No_light_status_camera',(.155,-3,1.03),(.155,0,1.03),.24)
    for o in bpy.data.objects:
        if o.type=='LIGHT':o.data.energy=0
    next(n for n in bpy.context.scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs['Strength'].default_value=0
    render(HERE/'views'/(asset+'_status_without_lights.png'))
random_errors=[]
for seed in range(512):
    a=make_look(seed);b=make_look(seed)
    if a!=b:random_errors.append('nondeterministic')
    if 'status' in a['colors']:random_errors.append('random status')
    if a['hairstyle'] not in STYLES:random_errors.append('unknown style')
    if any(tuple(c) not in COLORS[n] for n,c in a['colors'].items()):random_errors.append('palette')
load(HERE/'assets/agent_male_base.glb');original_status=tuple(node(bpy.data.materials['char_mat_status']).inputs['Base Color'].default_value)
apply_look(make_look(891,'agent_male_base'))
if tuple(node(bpy.data.materials['char_mat_status']).inputs['Base Color'].default_value)!=original_status:random_errors.append('status changed')
empty_scene();roots=[];materials=[]
for i in range(2):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(HERE/'assets/agent_male_base.glb'))
    added=set(bpy.data.objects)-before;root=next(o for o in added if o.parent not in added);roots.append(root)
    materials.append({m for o in added if o.type=='MESH' for m in o.data.materials})
disjoint=not materials[0].intersection(materials[1])
status='PASS' if not random_errors and disjoint and all(q['functional_draft_status']==q['non_hair_geometry_materials_unchanged']==q['one_active_hair']=='PASS' for q in results.values()) else 'FAIL'
write(HERE/'VARIANTS_QA.json',{'functional_draft_status':status,'combinations':results,'seed_cases':512,'random_errors':random_errors,
 'independent_material_datablocks_two_imports':'PASS' if disjoint else 'FAIL','runtime_randomization':'NOT_RUN',
 'legacy_agent_profile':'FAIL','new_profile_approval':'NOT_RUN','all_intersections':'NOT_RUN'})
print('VARIANT_QA',status,flush=True)
