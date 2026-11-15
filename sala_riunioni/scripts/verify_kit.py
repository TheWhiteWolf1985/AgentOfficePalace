"""Check the immutable kit files; user files in work/ and delivery/ are intentionally not hashed."""
from pathlib import Path
import argparse,hashlib,json,sys

def verify(root):
    recorded=json.loads((root/'KIT_MANIFEST.json').read_text(encoding='utf-8'));errors=[]
    for item in recorded['files']:
        rel=Path(item['path'])
        if rel.is_absolute() or '..' in rel.parts:errors.append('Unsafe manifest path');continue
        p=root/rel
        if not p.is_file() or p.is_symlink():errors.append('Missing/nonregular: '+item['path']);continue
        if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:errors.append('Changed: '+item['path'])
    return {'kit_version':recorded['kit_version'],'passed':not errors,'files_checked':len(recorded['files']),'errors':errors}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('root',nargs='?',type=Path,default=Path(__file__).resolve().parent.parent);a=parser.parse_args();r=verify(a.root);print(json.dumps(r,indent=2));sys.exit(0 if r['passed'] else 1)
