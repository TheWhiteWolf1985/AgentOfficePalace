"""Exit 0 means requested revision and inventory PASS, NOT strict budget compliance.

The unmodified kit inspector still returns FAIL for the declared 11 materials /
25 primitives and declared deviations. Both results are printed separately.
"""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from qa_glb import run

def main():
    result=run(ROOT)
    expected=json.loads((ROOT/'checksums.json').read_text(encoding='utf8'))['files']
    errors=[name for name,digest in expected.items() if not (ROOT/name).is_file() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
    actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p!=ROOT/'checksums.json'}
    extras=sorted(actual-set(expected))
    qa=json.loads((ROOT/'BLENDER_QA.json').read_text(encoding='utf8'))
    qa_matches=qa.get('source_glb_sha256')==hashlib.sha256((ROOT/'human_base.glb').read_bytes()).hexdigest()
    summary={'requested_revision_checks':result['status'],'strict_original_contract':result['strict_original_contract'],
             'blender_evidence':{'status':qa['status'],'matches_final_glb':qa_matches},
             'inventory':{'status':'FAIL' if errors or extras else 'PASS','files':len(expected),'mismatches':errors,'extras':extras}}
    print(json.dumps(summary,indent=2))
    return 0 if result['status']=='PASS' and not errors and not extras and qa['status']=='PASS' and qa_matches else 1

if __name__=='__main__':sys.exit(main())
