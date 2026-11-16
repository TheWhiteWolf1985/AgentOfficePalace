"""Verify the human_base final GLB, profile, manifest and file inventory."""
from pathlib import Path
import sys,json,hashlib
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'resources'))
from inspect_character import inspect

def main():
    contract=json.loads((ROOT/'resources/constraints.json').read_text(encoding='utf8'))
    manifest=json.loads((ROOT/'human_base.manifest.json').read_text(encoding='utf8'))
    result=inspect((ROOT/'human_base.glb').read_bytes(),contract,'human',manifest)
    expected=json.loads((ROOT/'checksums.json').read_text(encoding='utf8'))['files']
    errors=[name for name,sha in expected.items() if not (ROOT/name).is_file() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=sha]
    actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='checksums.json'}
    extras=sorted(actual-set(expected))
    result['inventory']={'status':'FAIL' if errors or extras else 'PASS','files':len(expected),'mismatches':errors,'extras':extras}
    print(json.dumps(result,indent=2))
    return 0 if result['status']=='PASS' and result['inventory']['status']=='PASS' else 1

if __name__=='__main__':sys.exit(main())
