"""Pack selected nodes of a static, untextured Blender delivery into a standalone GLB."""
from copy import deepcopy
import json
import struct


def pack_static_nodes(gltf, binary, selected):
    assert len(gltf['buffers']) == 1 and not any(k in gltf for k in ('animations', 'skins', 'images'))
    shell = deepcopy(gltf)
    nodes = shell['nodes']
    node_ids = {old: new for new, old in enumerate(sorted(selected))}
    shell['nodes'] = [nodes[i] for i in sorted(selected)]
    for n in shell['nodes']:
        if 'children' in n:
            n['children'] = [node_ids[i] for i in n['children'] if i in selected]
    for scene in shell['scenes']:
        if 'nodes' in scene:
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
    return (struct.pack('<4sII', b'glTF', 2, 28 + len(json_bytes) + len(payload)) +
                   struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes +
                   struct.pack('<I4s', len(payload), b'BIN\0') + payload)
