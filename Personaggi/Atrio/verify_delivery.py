"""Check the exported GLBs and exact package contents, without Blender."""
from pathlib import Path
import json,hashlib,sys
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE/'resources'));sys.path.insert(0,str(HERE))
from inspect_character import inspect
from geometry_reader import Asset
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def digest(a,p):return hashlib.sha256(json.dumps(sorted(a.signatures(p).items()),separators=(',',':')).encode()).hexdigest()
def verify(root=HERE,inventory=True):
    root=Path(root);contract=json.loads((root/'resources/constraints.json').read_text(encoding='utf8'))
    approval=json.loads((root/'APPROVED_GEOMETRY.json').read_text(encoding='utf8'))
    build=json.loads((root/'BUILD_REPORT.json').read_text(encoding='utf8'))
    fit=json.loads((root/'FIT_VALIDATION.json').read_text(encoding='utf8'))
    expected={'Budget exceeded: materials','Budget exceeded: primitives','Manifest deviations require separate review; not an in-contract PASS'}
    errors=[];checks={}
    for name in ['reception_a','reception_b']:
        p=root/(name+'.glb');manifest=json.loads(p.with_suffix('.manifest.json').read_text(encoding='utf8'))
        static=inspect(p.read_bytes(),contract,'human',manifest)
        errors.extend(name+': '+e for e in static['errors'] if e not in expected)
        signatures={n:'PASS' if digest(Asset(p),pose)==approval['assets'][name]['signatures'][n] else 'FAIL' for n,pose in approval['poses'].items()}
        if 'FAIL' in signatures.values():errors.append(name+' approved geometry/materials changed')
        if build[name]['source_sha256']!=sha(p) or build[name]['roundtrip']['status']!='PASS':errors.append(name+' roundtrip mismatch')
        if fit['asset_source_sha256'][name]!=sha(p):errors.append(name+' fit evidence mismatch')
        if manifest['checks']['artistic_approval']!='PASS':errors.append(name+' approval not recorded')
        accessory='char_bow_visual' if name=='reception_a' else 'char_headband_visual'
        a=Asset(p)
        if a.g['nodes'][a.parents[a.lookup[accessory]]]['name']!='char_head':errors.append(name+' accessory parent')
        checks[name]={'original_validator':static,'approved_geometry_eight_poses':signatures,'roundtrip':build[name]['roundtrip']['status'],
            'source_sha256':sha(p),'artistic_approval':'PASS','technical_budget_approval':'NOT_RUN'}
    placements=json.loads((root/'reception.placements.json').read_text(encoding='utf8'))
    if sha(root/'resources/atrium_reference.glb')!=placements['source_atrium_sha256']:errors.append('Atrium reference mismatch')
    if sha(root/'reception.placements.json')!=sha(root/'resources/reception.placements.json'):errors.append('Placements changed')
    if fit['reference_geometry_transforms_materials_unchanged']!='PASS':errors.append('Room changed in preview')
    if any(x['status']!='PASS' for v in fit['face_visibility_rays'].values() for x in v.values()):errors.append('Visitor visibility')
    inv_errors=[]
    if inventory:
        expected_files=json.loads((root/'checksums.json').read_text(encoding='utf8'))['files']
        actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='checksums.json'}
        inv_errors.extend(sorted(set(expected_files)^actual))
        inv_errors.extend(n for n,h in expected_files.items() if not (root/n).is_file() or sha(root/n)!=h)
    return {'functional_status':'FAIL' if errors else 'PASS','errors':errors,'assets':checks,
        'fit_visibility':'PASS' if not any('visibility' in e.lower() for e in errors) else 'FAIL',
        'original_budget':'FAIL','reference_budget_11_25':'FAIL','technical_budget_approval':'NOT_RUN',
        'application_QA':'NOT_RUN','all_intersections':'NOT_RUN','inventory':{'status':'FAIL' if inv_errors else 'PASS','errors':inv_errors}}
if __name__=='__main__':
    result=verify();print(json.dumps(result,indent=2));sys.exit(0 if result['functional_status']==result['inventory']['status']=='PASS' else 1)
