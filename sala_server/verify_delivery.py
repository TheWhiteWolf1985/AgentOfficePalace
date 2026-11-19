"""Verifica portatile del pacchetto con Python standard, senza installazioni."""
from pathlib import Path
import argparse
import hashlib
import json
import struct


def verify(root):
    root=Path(root).resolve()
    package=json.loads((root/'PACKAGE_MANIFEST.json').read_text(encoding='utf8'))
    errors=[]
    expected={r['path'] for r in package['files']}|{'PACKAGE_MANIFEST.json','COPY_VERIFICATION.json'}
    actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    for path in sorted(expected-actual):errors.append('Mancante: '+path)
    for path in sorted(actual-expected):errors.append('Extra: '+path)
    for row in package['files']:
        path=(root/row['path']).resolve()
        if not path.is_relative_to(root):errors.append('Percorso fuori pacchetto');continue
        if not path.is_file():continue
        blob=path.read_bytes()
        if len(blob)!=row['bytes'] or hashlib.sha256(blob).hexdigest()!=row['sha256']:
            errors.append('SHA/dimensione: '+row['path'])
    glb=root/'delivery/server_room.glb';blob=glb.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',blob)
    chunklen,kind=struct.unpack_from('<II',blob,12)
    doc=json.loads(blob[20:20+chunklen])
    checks={'glb2':magic==b'glTF' and version==2 and length==len(blob) and kind==0x4E4F534A,
      'self_contained':all('uri' not in row for row in doc.get('buffers',[])+doc.get('images',[])),
      'no_required_extensions':not doc.get('extensionsRequired'),
      'no_cameras_or_preview_lights':not doc.get('cameras') and 'KHR_lights_punctual' not in doc.get('extensions',{})}
    fingerprint=json.loads((root/'verification/DELIVERY_FINGERPRINT.json').read_text(encoding='utf8'))
    nodes={n.get('name') for n in doc['nodes']}
    checks['exact_asset_node_set']=nodes=={n['name'] for n in fingerprint['asset']['objects']}
    glass=next(m for m in doc['materials'] if m['name']=='server_v12_access_mat_glass')
    checks['transparent_window_and_partition_glass']=glass.get('alphaMode')=='BLEND' and glass['pbrMetallicRoughness']['baseColorFactor'][3]<.2
    report=json.loads((root/'delivery/DRAFT_CHECKS.json').read_text(encoding='utf8'))
    checks['blender_checks_pass']=report['automatic_checks_pass'] and all(report['checks'].values())
    checks['validated_glb_hash_matches']=report['glb_sha256']==hashlib.sha256(blob).hexdigest()
    comparison=json.loads((root/'verification/REBUILD_COMPARISON.json').read_text(encoding='utf8'))
    checks['approved_live_and_independent_rebuild_match']=comparison['live_delivery_match'] and comparison['independent_rebuild_match']
    for name,passed in checks.items():
        if not passed:errors.append(name)
    return {'passed':not errors,'files':len(actual),'verified_payload_files':len(package['files']),
            'all_sha256_match':not any(e.startswith('SHA/') for e in errors),
            'glb_sha256':hashlib.sha256(blob).hexdigest(),'checks':checks,'errors':errors}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',nargs='?',type=Path,default=Path(__file__).resolve().parent)
    args=p.parse_args();result=verify(args.root)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['passed'] else 1)
