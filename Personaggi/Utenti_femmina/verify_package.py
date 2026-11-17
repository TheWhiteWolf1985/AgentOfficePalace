"""Verify current-request assets, recorded Blender evidence and SHA inventory."""
from pathlib import Path
import json,hashlib,sys
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from verify_assets import verify

def main():
    result=verify(HERE)
    expected=json.loads((HERE/'checksums.json').read_text(encoding='utf8'))['files']
    errors=[n for n,h in expected.items() if not (HERE/n).is_file() or hashlib.sha256((HERE/n).read_bytes()).hexdigest()!=h]
    actual={p.relative_to(HERE).as_posix() for p in HERE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p!=HERE/'checksums.json'}
    errors+=sorted(actual-set(expected))
    q=json.loads((HERE/'ASSEMBLY_QA.json').read_text(encoding='utf8'))
    c=json.loads((HERE/'COMPONENT_ROUNDTRIP.json').read_text(encoding='utf8'))
    evidence=[]
    for name,r in result['assembled_avatar_checks'].items():
        if q['assemblies'].get(name,{}).get('source_sha256')!=r['source_sha256']:evidence.append(name)
    for name,r in result['component_checks'].items():
        if c['components'].get(name,{}).get('sha256')!=r['source_sha256']:evidence.append('hair_'+name)
    summary={'asset_checks':result['status'],'functional_asset_checks':result['functional_status'],
             'current_budget_11_materials_25_primitives':result['status'],
             'blender_assembly_checks':q['status'],'component_roundtrip':c['status'],
             'evidence_matches_final_files':not evidence,'evidence_mismatches':evidence,
             'inventory':{'status':'FAIL' if errors else 'PASS','files':len(expected),'errors':errors},
             'original_validator':'FAIL for legacy budgets/deviations, preserved in *.original_check.json',
             'runtime_application':'NOT_RUN'}
    print(json.dumps(summary,indent=2))
    return 0 if result['functional_status']==q['status']==c['status']=='PASS' and not errors and not evidence else 1

if __name__=='__main__':sys.exit(main())
