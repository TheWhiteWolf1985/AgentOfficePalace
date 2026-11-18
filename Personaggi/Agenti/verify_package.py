"""Verify integrity and proposed-rig checks; retain legacy FAIL explicitly."""
from pathlib import Path
import sys,json,hashlib,math
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));sys.path.insert(0,str(HERE/'resources'))
from geometry_reader import Asset
from inspect_character import inspect
from appearance import make_look,STYLES
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(root=HERE,inventory=True):
    root=Path(root);errors=[]
    proposal=json.loads((root/'PROPOSED_AGENT_PROFILE.json').read_text(encoding='utf8'))
    contract=json.loads((root/'resources/constraints.json').read_text(encoding='utf8'))
    if proposal['original_constraints_sha256']!=sha(root/'resources/constraints.json'):errors.append('Original contract changed')
    recorded=json.loads((root/'DRAFT_VALIDATION.json').read_text(encoding='utf8'))
    variants=json.loads((root/'VARIANTS_QA.json').read_text(encoding='utf8'))
    if variants['functional_draft_status']!='PASS':errors.append('Recorded variant checks failed')
    assets={}
    for asset in ['agent_male_base','agent_female_base']:
        p=root/'assets'/(asset+'.glb');a=Asset(p);g=a.g
        m=json.loads(p.with_suffix('.manifest.json').read_text(encoding='utf8'))
        if m['sha256']!=sha(p) or recorded[asset]['draft_checks']['source_sha256']!=sha(p):errors.append(asset+' source hash')
        if m['profile']!='agent_humanoid_draft' or m['contract']!=proposal['id']:errors.append(asset+' wrong draft declaration')
        if m['checks']['artistic_approval']!='PASS':errors.append(asset+' missing artistic approval')
        for name,c in proposal['nodes'].items():
            if name not in a.lookup:errors.append(asset+' missing '+name);continue
            i=a.lookup[name];n=g['nodes'][i];parent=g['nodes'][a.parents[i]]['name'] if i in a.parents else None
            if parent!=c['parent']:errors.append(asset+' parent '+name)
            for key,default,target in [('translation',[0,0,0],c['translation']),('rotation',[0,0,0,1],c['rotation']),('scale',[1,1,1],c['scale'])]:
                if max(abs(v-w) for v,w in zip(n.get(key,default),target))>1e-5:errors.append(asset+' '+key+' '+name)
        names={x['name'] for x in g['materials']}
        if any(name not in names for name in m['material_roles'].values()):errors.append(asset+' missing material')
        status=next(x for x in g['materials'] if x['name']=='char_mat_status')
        if max(status.get('emissiveFactor',[0,0,0]))<=0:errors.append(asset+' status emission')
        if g.get('skins') or g.get('animations') or g.get('cameras'):errors.append(asset+' forbidden payload')
        legacy=json.loads((root/'resources/agent.manifest.json').read_text(encoding='utf8'))
        legacy.update(asset_id=asset,file=p.name,sha256=sha(p),blender_version=m['blender_version'],license=m['license'],
            material_roles={'body':'char_mat_skin','status':'char_mat_status'},body_mesh_nodes=m['body_mesh_nodes'],deviations=m['deviations'])
        actual=inspect(p.read_bytes(),contract,'agent',legacy)
        original=json.loads(p.with_suffix('.legacy_agent_check.json').read_text(encoding='utf8'))
        if actual['errors']!=original['errors'] or actual['metrics']!=original['metrics']:errors.append(asset+' legacy evidence mismatch')
        if recorded[asset]['draft_checks']['functional_draft_status']!='PASS':errors.append(asset+' recorded draft checks')
        assets[asset]={'functional_draft_status':'PASS','source_sha256':sha(p),'original_agent_validator':actual,
            'artistic_approval':'PASS','new_technical_profile_approval':'NOT_RUN'}
    for name,q in variants['combinations'].items():
        p=root/'qa_assemblies'/(name+'.glb')
        if not p.is_file() or sha(p)!=q['source_sha256']:errors.append('Variant evidence mismatch '+name)
        if q['non_hair_geometry_materials_unchanged']!='PASS' or q['one_active_hair']!='PASS':errors.append('Variant failed '+name)
    for i,look in enumerate(json.loads((root/'SAMPLE_LOOKS.json').read_text(encoding='utf8'))):
        if make_look(look['seed'],look['asset_id'])!=look:errors.append('Seed mismatch '+str(i))
        if 'status' in look['colors']:errors.append('Randomized status')
        a=Asset(root/'assets'/('sample_'+str(i)+'.glb'));mats={m['name']:m for m in a.g['materials']}
        for role,color in look['colors'].items():
            mat=mats['char_mat_'+role]
            if max(abs(v-w) for v,w in zip(mat['pbrMetallicRoughness']['baseColorFactor'],color))>1e-6:errors.append('Sample color '+str(i)+' '+role)
            if role in ['iris','eyebrows','mouth'] and max(abs(v-w*.35) for v,w in zip(mat['emissiveFactor'],color))>1e-6:errors.append('Sample emission '+str(i)+' '+role)
    for entry in json.loads((root/'hair/CATALOG.json').read_text(encoding='utf8'))['styles']:
        p=root/'hair'/entry['file'];a=Asset(p)
        if sha(p)!=entry['sha256']:errors.append('Hair hash '+entry['style_id'])
        meshes=[n for n in a.g['nodes'] if 'mesh' in n]
        if len(meshes)!=(0 if entry['style_id']=='bald' else 1):errors.append('Hair mesh count')
        if meshes and (len(a.g['materials'])!=1 or a.g['materials'][0]['name']!='char_mat_hair'):errors.append('Hair material')
    inv_errors=[]
    if inventory:
        expected=json.loads((root/'checksums.json').read_text(encoding='utf8'))['files']
        actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='checksums.json'}
        inv_errors.extend(sorted(set(expected)^actual))
        inv_errors.extend(n for n,h in expected.items() if not (root/n).is_file() or sha(root/n)!=h)
    return {'functional_package_status':'FAIL' if errors else 'PASS','errors':errors,'assets':assets,
        'inventory':{'status':'FAIL' if inv_errors else 'PASS','errors':inv_errors},'original_agent_contract':'FAIL','original_budget':'FAIL',
        'new_technical_profile_approval':'NOT_RUN','runtime_randomization':'NOT_RUN','application_QA':'NOT_RUN'}
if __name__=='__main__':
    result=verify();print(json.dumps(result,indent=2));sys.exit(0 if result['functional_package_status']==result['inventory']['status']=='PASS' else 1)
