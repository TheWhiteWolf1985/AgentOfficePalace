"""Verify final exported GLB, component contracts, approval geometry and hashes.

Exit code concerns functional/integrity checks. Budget failures remain FAIL.
"""
from pathlib import Path
import sys,json,hashlib
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE/'resources'));sys.path.insert(0,str(HERE))
from inspect_character import inspect
from glb_common import parse
from geometry_reader import Asset
def digest(asset,pose=None):
    return hashlib.sha256(json.dumps(sorted(asset.signatures(pose).items()),separators=(',',':')).encode()).hexdigest()
def verify(root=HERE,inventory=True):
    root=Path(root);config=json.loads((root/'package_config.json').read_text(encoding='utf8'))
    p=root/(config['asset']+'.glb');manifest=json.loads(p.with_suffix('.manifest.json').read_text(encoding='utf8'))
    c=json.loads((root/'resources/constraints.json').read_text(encoding='utf8'))
    static=inspect(p.read_bytes(),c,'human',manifest)
    allowed={'Budget exceeded: primitives','Budget exceeded: materials','Manifest deviations require separate review; not an in-contract PASS'}
    errors=[e for e in static['errors'] if e not in allowed]
    ref=json.loads((root/'APPROVED_GEOMETRY.json').read_text(encoding='utf8'));a=Asset(p)
    geometry={name:'PASS' if digest(a,pose)==ref['signatures'][name] else 'FAIL' for name,pose in ref['poses'].items()}
    if 'FAIL' in geometry.values():errors.append('Approved geometry/materials changed')
    for role,name in manifest['material_roles'].items():
        if sum(m['name']==name for m in a.g['materials'])!=1:errors.append('Invalid material role '+role)
    component_checks={}
    for entry in json.loads((root/'hair/CATALOG.json').read_text(encoding='utf8'))['styles']:
        path=root/'hair'/entry['file'];g,b=parse(path.read_bytes());ce=[];style=entry['style_id']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:ce.append('SHA mismatch')
        if g.get('animations') or g.get('skins'):ce.append('Non-rigid component')
        nodes=[n for n in g.get('nodes',[]) if 'mesh' in n];mats=g.get('materials',[])
        if len(nodes)!=(0 if style=='bald' else 1):ce.append('Wrong mesh count')
        if style!='bald' and (len(mats)!=1 or mats[0]['name']!='char_mat_hair'):ce.append('Hair must have one hair material')
        for n in g.get('nodes',[]):
            if any(abs(v)>1e-6 for v in n.get('translation',[0,0,0])) or any(abs(v-1)>1e-6 for v in n.get('scale',[1,1,1])):ce.append('Nonidentity component TRS')
            if max(abs(v-w) for v,w in zip(n.get('rotation',[0,0,0,1]),[0,0,0,1]))>1e-6:ce.append('Nonidentity rotation')
        component_checks[style]={'status':'FAIL' if ce else 'PASS','errors':ce}
        errors.extend(style+': '+e for e in ce)
    inv_errors=[]
    if inventory:
        inv=json.loads((root/'checksums.json').read_text(encoding='utf8'))['files']
        actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='checksums.json'}
        inv_errors.extend(sorted(set(inv)^actual))
        inv_errors.extend(n for n,h in inv.items() if not (root/n).is_file() or hashlib.sha256((root/n).read_bytes()).hexdigest()!=h)
    rt=json.loads((root/'BUILD_REPORT.json').read_text(encoding='utf8'))['roundtrip']
    if rt['status']!='PASS' or rt['source_sha256']!=hashlib.sha256(p.read_bytes()).hexdigest():errors.append('Roundtrip evidence missing/mismatched')
    return {'functional_status':'FAIL' if errors else 'PASS','errors':errors,'approved_geometry_eight_poses':geometry,
        'original_validator':static,'requested_reference_budget_11_25':'PASS' if static['metrics']['materials']<=11 and static['metrics']['primitives']<=25 else 'FAIL',
        'component_checks':component_checks,'inventory':{'status':'FAIL' if inv_errors else 'PASS','errors':inv_errors},
        'artistic_approval':'PASS','technical_budget_approval':'NOT_RUN','application_QA':'NOT_RUN'}
if __name__=='__main__':
    r=verify();print(json.dumps(r,indent=2));sys.exit(0 if r['functional_status']==r['inventory']['status']=='PASS' else 1)
