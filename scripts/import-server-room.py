"""Verify the original delivery; derive runtime data and a compact exterior GLB."""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import re
import shutil
import struct

root = Path(__file__).resolve().parents[1]
source = root / 'sala_server'
package = json.loads((source / 'PACKAGE_MANIFEST.json').read_text(encoding='utf-8-sig'))
for row in package['files']:
    p = source / row['path']
    assert p.resolve().is_relative_to(source.resolve()), row['path']
    raw = p.read_bytes()
    assert len(raw) == row['bytes'] and hashlib.sha256(raw).hexdigest() == row['sha256'], row['path']
raw = (source / 'delivery/server_room.glb').read_bytes()
magic, version, length = struct.unpack_from('<4sII', raw)
assert magic == b'glTF' and version == 2 and length == len(raw)
json_size = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20 + json_size])
binary = raw[28 + json_size:]
assert len(gltf['buffers']) == 1 and not any(k in gltf for k in ['animations', 'skins', 'images'])
manifest = json.loads((source / 'delivery/server_room.manifest.json').read_text(encoding='utf-8-sig'))


def point(p):
    return dict(x=round(p[0], 5), y=round(p[2], 5), z=round(-p[1], 5))


def collider(c, index):
    lo, hi = c['min_blender_m'], c['max_blender_m']
    return dict(id=c['node'] + ':' + str(index), role=c.get('role', 'architecture'),
                minX=round(lo[0], 5), maxX=round(hi[0], 5), minZ=round(-hi[1], 5), maxZ=round(-lo[1], 5),
                bottom=round(lo[2], 5), top=round(hi[2], 5))


# Copy only the architectural shell, retaining the original node transforms and geometry.
# Repack the referenced buffer views so racks/equipment are not downloaded from other floors.
shell = deepcopy(gltf)
nodes = shell['nodes']
pattern = re.compile(r'^server_v12_(wall_|window_|floor_support_|ceiling_)')
selected = {i for i, n in enumerate(nodes) if 'mesh' in n and pattern.match(n.get('name', ''))}
parents = {child: i for i, n in enumerate(nodes) for child in n.get('children', [])}
for i in list(selected):
    while i in parents:
        i = parents[i]
        selected.add(i)
node_ids = {old: new for new, old in enumerate(sorted(selected))}
shell['nodes'] = [nodes[i] for i in sorted(selected)]
for n in shell['nodes']:
    if 'children' in n:
        n['children'] = [node_ids[i] for i in n['children'] if i in selected]
for scene in shell['scenes']:
    scene['nodes'] = [node_ids[i] for i in scene['nodes'] if i in selected]
meshes = sorted({n['mesh'] for n in shell['nodes'] if 'mesh' in n})
mesh_ids = {old: new for new, old in enumerate(meshes)}
shell['meshes'] = [shell['meshes'][i] for i in meshes]
for n in shell['nodes']:
    if 'mesh' in n:
        n['mesh'] = mesh_ids[n['mesh']]
accessors = set()
for mesh in shell['meshes']:
    for p in mesh['primitives']:
        accessors.update(p['attributes'].values())
        if 'indices' in p:
            accessors.add(p['indices'])
accessors = sorted(accessors)
accessor_ids = {old: new for new, old in enumerate(accessors)}
shell['accessors'] = [shell['accessors'][i] for i in accessors]
for mesh in shell['meshes']:
    for p in mesh['primitives']:
        p['attributes'] = {k: accessor_ids[v] for k, v in p['attributes'].items()}
        if 'indices' in p:
            p['indices'] = accessor_ids[p['indices']]
views = sorted({a['bufferView'] for a in shell['accessors']})
view_ids = {old: new for new, old in enumerate(views)}
shell['bufferViews'] = [shell['bufferViews'][i] for i in views]
payload = bytearray()
for view in shell['bufferViews']:
    while len(payload) % 4:
        payload.append(0)
    offset = view.get('byteOffset', 0)
    view['byteOffset'] = len(payload)
    payload += binary[offset:offset + view['byteLength']]
for a in shell['accessors']:
    assert 'sparse' not in a
    a['bufferView'] = view_ids[a['bufferView']]
shell['buffers'] = [{'byteLength': len(payload)}]
json_bytes = json.dumps(shell, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
payload += b'\0' * (-len(payload) % 4)
shell_bytes = (struct.pack('<4sII', b'glTF', 2, 28 + len(json_bytes) + len(payload)) +
               struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes +
               struct.pack('<I4s', len(payload), b'BIN\0') + payload)
assert len(shell_bytes) < len(raw) * .3

seats = [dict(id=s['seat'], chair=manifest['operations']['workstations'][i]['operator_chair'],
              position=point(s['position_blender_m']), stand=point(s['stand_blender_m']), facing=point(s['forward_blender']))
         for i, s in enumerate(manifest['operations']['seats'])]
boxes = manifest['collider_reference_boxes'] + manifest['access_partition']['colliders'] + manifest['operations']['colliders']
# Rack footprints already include their glass doors in the supplied general list.
assert sum(c.get('role') == 'rack_reference_box' for c in boxes) == len(manifest['racks'])
# The general list already includes the partition and operations sections.
# Preserve distinct boxes sharing a node, but never install the same solid twice.
unique = {}
for c in boxes:
    key = (c['node'], tuple(c['min_blender_m']), tuple(c['max_blender_m']))
    unique[key] = c
boxes = list(unique.values())
door = manifest['access_partition']['door']
data = dict(sourceSha256=hashlib.sha256(raw).hexdigest(), exteriorSha256=hashlib.sha256(shell_bytes).hexdigest(),
            root=manifest['root_node'], height=manifest['ceiling_height_m'], rackCount=len(manifest['racks']), seats=seats,
            door=dict(pivot=door['pivot'], hinge=point(door['hinge_blender_m']), angle=door['open_angle_z_rad']),
            panels=manifest['whiteboards'], colliders=[collider(c, i) for i, c in enumerate(boxes)])
lines = ['// Generated by scripts/import-server-room.py; GLB is already application Y-up.', 'export const SERVER_ROOM_DATA = {']
for key, value in data.items():
    if isinstance(value, list):
        lines += ['  '+key+': ['] + ['    '+json.dumps(v, ensure_ascii=False, separators=(',', ':'))+',' for v in value] + ['  ],']
    else:
        lines += ['  '+key+': '+json.dumps(value, ensure_ascii=False, separators=(',', ':'))+',']
lines += ['} as const;', '']
(root / 'src/shared/server-room-data.ts').write_text('\n'.join(lines), encoding='utf8', newline='\n')
shutil.copyfile(source / 'delivery/server_room.glb', root / 'src/client/models/server_room.glb')
(root / 'src/client/models/server_room_exterior.glb').write_bytes(shell_bytes)
print('Verified', len(package['files']), 'package entries; GLB', len(raw), 'bytes; shell', len(shell_bytes),
      'bytes; racks', len(manifest['racks']), '; seats', len(seats), '; colliders', len(boxes))
