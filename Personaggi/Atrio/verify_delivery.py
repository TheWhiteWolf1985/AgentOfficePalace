"""Validate final GLBs/manifests, reception envelopes and the SHA-256 inventory."""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'resources'))
from inspect_character import inspect

def run(root):
    contract=json.loads((root/'resources/constraints.json').read_text(encoding='utf8'))
    placements=json.loads((root/'reception.placements.json').read_text(encoding='utf8'))
    furniture=json.loads((root/'resources/reception_furniture_bounds.json').read_text(encoding='utf8'))
    results={};collisions=[];envelopes=[]
    for slot in placements['placements']:
        asset=Path(slot['asset']).stem
        manifest=json.loads((root/(asset+'.manifest.json')).read_text(encoding='utf8'))
        result=inspect((root/slot['asset']).read_bytes(),contract,'human',manifest)
        results[asset]=result
        b=result['metrics'];s=slot['runtime_instance_scale'];pos=slot['runtime_position']
        lo=[pos[i]+b['bounds_min'][i]*s[i] for i in range(3)]
        hi=[pos[i]+b['bounds_max'][i]*s[i] for i in range(3)]
        envelopes.append({'asset':asset,'min':lo,'max':hi})
        for obstacle in furniture:
            if all(min(hi[i],obstacle['max'][i])-max(lo[i],obstacle['min'][i])>0.0001 for i in range(3)):
                collisions.append({'asset':asset,'obstacle':obstacle['name']})
    results['reception_fit']={'status':'FAIL' if collisions else 'PASS','collisions':collisions,'envelopes':envelopes,
                             'scope':'Static AABB versus kit-measured reception furniture; no navigation/application test.'}
    results['placements_unchanged']={'status':'PASS' if (root/'reception.placements.json').read_bytes()==(root/'resources/reception.placements.json').read_bytes() else 'FAIL'}
    ledger=root/'checksums.json'
    if ledger.is_file():
        inventory=json.loads(ledger.read_text(encoding='utf8'))['files']
        errors=[name for name,sha in inventory.items() if not (root/name).is_file() or hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha]
        current={str(p.relative_to(root)).replace('\\','/') for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='checksums.json'}
        errors+=sorted(current-set(inventory))
        results['sha256_inventory']={'status':'FAIL' if errors else 'PASS','files':len(inventory),'errors':errors}
    return results

if __name__=='__main__':
    result=run(ROOT)
    print(json.dumps(result,indent=2))
    sys.exit(0 if all(r['status']=='PASS' for r in result.values()) else 1)
