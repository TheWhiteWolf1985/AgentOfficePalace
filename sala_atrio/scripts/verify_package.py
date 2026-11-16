from pathlib import Path
import hashlib,json,struct
root=Path(__file__).resolve().parent.parent
m=json.loads((root/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
errors=[]
for row in m['files']:
    p=root/row['path']
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:
        errors.append(row['path'])
data=(root/'delivery/atrium.glb').read_bytes()
magic,version,length=struct.unpack_from('<4sII',data)
assert magic==b'glTF' and version==2 and length==len(data)
assert not errors,errors
print('PASS:',len(m['files']),'file verificati; GLB 2.0 valido.')
