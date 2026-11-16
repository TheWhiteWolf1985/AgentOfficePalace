"""Validate the delivered user avatar without changing its originals, then copy the runtime GLB."""
from pathlib import Path
import hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'Personaggi/Utenti'
inventory=json.loads((SOURCE/'checksums.json').read_text(encoding='utf8'))['files']
for name,sha in inventory.items():
    p=SOURCE/name;assert p.resolve().is_relative_to(SOURCE.resolve()),name
    assert hashlib.sha256(p.read_bytes()).hexdigest()==sha,name
sys.path.insert(0,str(SOURCE/'resources'))
from inspect_character import inspect
manifest=json.loads((SOURCE/'human_base.manifest.json').read_text(encoding='utf8'))
contract=json.loads((SOURCE/'resources/constraints.json').read_text(encoding='utf8'))
raw=(SOURCE/'human_base.glb').read_bytes();report=inspect(raw,contract,'human',manifest)
assert report['status']=='PASS',report
assert manifest['asset_id']=='human_base' and manifest['root']=='char_root'
shutil.copyfile(SOURCE/'human_base.glb',ROOT/'src/client/models/human_base.glb')
print('HUMAN_BASE_IMPORTED',manifest['sha256'],'inventory files',len(inventory))
