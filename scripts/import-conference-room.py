from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[1];src=root/'sala_riunioni'
package=json.loads((src/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8-sig'))
for f in package['files']:
 p=src/f['path'];assert p.resolve().is_relative_to(src.resolve())
 assert len(p.read_bytes())==f['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],f['path']
m=json.loads((src/'delivery/conference_room.manifest.json').read_text(encoding='utf-8-sig'))
assert hashlib.sha256((src/'delivery/conference_room.glb').read_bytes()).hexdigest()==m['glb_sha256']
shutil.copyfile(src/'delivery/conference_room.glb',root/'src/client/models/conference_room.glb')
def pt(p):return {'x':round(p[0],5),'y':round(p[2],5),'z':round(-p[1],5)}
colliders=[]
for c in m['colliders']:
 lo=c['min_blender_m'];hi=c['max_blender_m']
 colliders.append(dict(id=c['id'],minX=lo[0],maxX=hi[0],minZ=-hi[1],maxZ=-lo[1],bottom=lo[2],top=hi[2],role=c['role'],**({'active_when':c['active_when']} if 'active_when'in c else {})))
data=dict(sourceSha256=m['glb_sha256'],height=m['ceiling_height_m'],door=m['room_partition'],whiteboard=m['whiteboard'],seats=[dict(id=s['anchor'],stand=pt(s['stand_blender_m']),position=pt(s['position_blender_m']),facing=pt(s['facing_blender']),role=s['role'],chair=s.get('chair_node')) for s in m['seats']],colliders=colliders,materials=m['materials'])
lines=['// Generated from sala_riunioni/delivery/conference_room.manifest.json.','// Coordinates are already converted to application Y-up; do not rotate the GLB again.','export const CONFERENCE_DATA = {']
for k,v in data.items():
 if isinstance(v,list):lines += ['  '+k+': [']+['    '+json.dumps(x,ensure_ascii=False,separators=(',',':'))+','for x in v]+['  ],']
 else:lines+=['  '+k+': '+json.dumps(v,ensure_ascii=False,separators=(',',':'))+',']
lines+=['} as const;',''];(root/'src/shared/conference-room-data.ts').write_text('\n'.join(lines),encoding='utf8',newline='\n')
print('Verified package files',len(package['files']),'GLB',m['glb_sha256'],'seats',len(data['seats']),'colliders',len(colliders))
