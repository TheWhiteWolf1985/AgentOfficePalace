"""Validate the four deliveries before copying the selected runtime assets."""
import argparse
import copy
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DELIVERIES = ROOT / 'Personaggi'
RUNTIME = ROOT / 'src/client/models'
ROLES = 'skin hair eyebrows iris clothing shirt tie pants shoes accent'.split()
STYLES = 'short long bun spiky curly ponytail bald'.split()
INSPECTOR = {
    'inspect_character.py': '9363f8aea7e15c4465babcb8d66a82b97085c5002b37e8d4437561deeeb250d4',
    'glb_common.py': 'cff55f060c8f57df81f58ed6659dcec1b033224243615850e76cf98e5556fcc1',
    'constraints.json': 'f8603ac1259bf986256913256e73ae52b10cfc26d61c10144396940c55f9eeb7',
}
# Asset-specific runtime budgets. Original Blender contracts and failure reports are preserved.
ASSETS = {
    'human_base': ('Utenti_maschio', 'human_base_concept01_v01', 12, 26),
    'female_base': ('Utenti_femmina', 'female_base_concept01_v01', 13, 27),
    'reception_a': ('Atrio', 'reception_a_concept02_v01', 13, 28),
    'reception_b': ('Atrio', 'reception_b_concept02_v01', 13, 28),
    'agent_male_base': ('Agenti', 'agent_male_base', 14, 32),
    'agent_female_base': ('Agenti', 'agent_female_base', 15, 33),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_inventory(folder):
    for name, expected in read(folder / 'checksums.json')['files'].items():
        path = folder / name
        require(path.resolve().is_relative_to(folder.resolve()), f'Invalid inventory path: {name}')
        require(sha(path) == expected, f'Checksum mismatch: {folder.name}/{name}')
    for name, expected in INSPECTOR.items():
        require(sha(folder / 'resources' / name) == expected, f'Original kit changed: {name}')


def validate(name, raw, contract, manifest):
    folder, asset_id, materials, primitives = ASSETS[name]
    agent = folder == 'Agenti'
    require(manifest['asset_id'] == asset_id, f'Unexpected asset revision: {name}')
    require(len(manifest.get('deviations', [])) == 1, f'Unexpected deviations: {name}')
    for role in ROLES:
        require(manifest['material_roles'].get(role) == 'char_mat_' + role, f'Wrong role: {name}/{role}')
    extras = {'female_base': ['bow'], 'reception_a': ['bow'], 'reception_b': ['headband'],
              'agent_male_base': ['mouth', 'status'], 'agent_female_base': ['mouth', 'status', 'bow']}
    for role in extras.get(name, []):
        require(manifest['material_roles'].get(role) == 'char_mat_' + role, f'Wrong role: {name}/{role}')
    app_contract = copy.deepcopy(contract)
    human = app_contract['profiles']['human']
    human['limits'].update(materials=materials, primitives=primitives)
    human['required_material_roles'] = ROLES + extras.get(name, [])
    reviewed = copy.deepcopy(manifest)
    if agent:
        require(manifest['contract'] == 'AOP_AGENT_HUMANOID_DRAFT_1'
                and manifest['profile'] == 'agent_humanoid_draft', 'Unexpected agent rig profile')
        for control, parent, position in [
            ('char_pupil_negx', 'char_eye_negx', [0, 0, 0]),
            ('char_pupil_posx', 'char_eye_posx', [0, 0, 0]),
            ('char_status', 'char_torso', [0.155, 0.31, 0.197]),
        ]:
            human['nodes'][control] = {'parent': parent, 'translation': position, 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}
        reviewed.update(contract=contract['contract'], contract_version=contract['version'], profile='human')
    else:
        original = inspect(raw, contract, 'human', manifest)
        require(set(original['errors']) == {'Budget exceeded: materials', 'Budget exceeded: primitives',
                'Manifest deviations require separate review; not an in-contract PASS'}, str(original['errors']))
    reviewed['deviations'] = []
    result = inspect(raw, app_contract, 'human', reviewed)
    require(result['status'] == 'PASS', f'{name}: {result["errors"]}')
    gltf, _ = parse(raw)
    nodes = {node['name']: node for node in gltf['nodes']}
    for accessory in ['bow', 'headband']:
        if accessory in extras.get(name, []):
            require(nodes[f'char_{accessory}_visual'] in [gltf['nodes'][i] for i in nodes['char_head']['children']],
                    f'{name}: {accessory} must remain under the head when hair changes')
    by_name = {mat['name']: mat for mat in gltf['materials']}
    if agent:
        require(max(by_name['char_mat_status']['emissiveFactor']) > 0, f'{name}: missing status glow')
    return result, by_name


# Run only the known kit version. Delivery instructions and build scripts are not executed.
KIT = DELIVERIES / 'Utenti_maschio' / 'resources'
for entry, expected in INSPECTOR.items():
    require(sha(KIT / entry) == expected, f'Original kit changed: {entry}')
sys.path.insert(0, str(KIT))
from inspect_character import inspect
from glb_common import parse


def srgb(rgb):
    return '#' + ''.join(f'{round(255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)):02x}' for v in rgb[:3])


def main(selection='all'):
    names = list(ASSETS) if selection == 'all' else [n for n, a in ASSETS.items() if a[0] == selection]
    for folder in sorted({ASSETS[n][0] for n in names}):
        verify_inventory(DELIVERIES / folder)
    contract = read(KIT / 'constraints.json')
    copies, staff, defaults = {}, [], {}
    for name in names:
        folder = ASSETS[name][0]
        base = DELIVERIES / folder / ('assets' if folder == 'Agenti' else '')
        source = base / (name + '.glb')
        manifest = read(source.with_suffix('.manifest.json'))
        result, materials = validate(name, source.read_bytes(), contract, manifest)
        copies[source.name] = source
        defaults[name] = {role: srgb(materials[f'char_mat_{role}']['pbrMetallicRoughness']['baseColorFactor'])
                          for role in ROLES + ['bow', 'mouth'] if f'char_mat_{role}' in materials}
        if folder == 'Atrio':
            placements = read(base / 'reception.placements.json')
            require(placements['source_atrium_sha256'] == sha(RUNTIME / 'atrium.glb'), 'Atrium placement reference differs')
            i = len(staff)
            slot = placements['placements'][i]
            pos, scale = slot['runtime_position'], 1.15
            require(pos == [(-1.1 if i == 0 else 1.1), 0, -10.8]
                    and slot['runtime_instance_scale'] == [scale] * 3 and slot['runtime_rotY'] == 0, 'Reception placement differs')
            lo, hi = ([round(pos[k] + scale * result['metrics'][bound][k], 6) for k in range(3)]
                      for bound in ['bounds_min', 'bounds_max'])
            staff.append({'id': slot['id'], 'model': name, 'sha256': manifest['sha256'],
                          'position': dict(zip('xyz', pos)), 'rotY': 0, 'scale': scale,
                          'collider': dict(zip(['id', 'minX', 'maxX', 'minZ', 'maxZ', 'bottom', 'top'],
                                               [slot['id'], lo[0], hi[0], lo[2], hi[2], lo[1], hi[1]]))})
        print(name, 'runtime rig PASS', result['metrics'])
    if selection in ['all', 'Utenti_femmina']:
        for style in STYLES:
            filename = f'hair_{style}.glb'
            sources = [DELIVERIES / d / 'hair' / filename for d in ['Utenti_maschio', 'Utenti_femmina', 'Agenti']]
            require(len({sha(p) for p in sources}) == 1, f'Divergent hair asset: {style}')
            gltf, _ = parse(sources[0].read_bytes())
            require(len(gltf.get('meshes', [])) == (0 if style == 'bald' else 1), f'Invalid hair geometry: {style}')
            if style != 'bald':
                require([m['name'] for m in gltf['materials']] == ['char_mat_hair'], f'Invalid hair color: {style}')
                copies[filename] = sources[0]
    for filename, source in copies.items():
        shutil.copyfile(source, RUNTIME / filename)
    if staff:
        output = '// Generated by scripts/import-reception-staff.py; GLBs are already Y-up, local scale 1.\n'
        output += 'export const RECEPTION_STAFF = ' + json.dumps(staff, indent=2) + ' as const;\n'
        (ROOT / 'src/shared/reception-staff.ts').write_text(output, encoding='utf-8', newline='\n')
    if selection == 'all':
        palette = read(DELIVERIES / 'Agenti/APPEARANCE_CATALOG.json')['material_palettes_linear_rgb']
        data = {'user': defaults['female_base'], 'agent': defaults['agent_female_base'],
                'random': {role: [srgb(rgb) for rgb in colors] for role, colors in palette.items()}}
        output = '// Generated by scripts/import_characters.py from the approved GLBs and agent palette.\n'
        output += 'export const characterPalette = ' + json.dumps(data, indent=2) + ' as const;\n'
        (ROOT / 'src/shared/character-palette.ts').write_text(output, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('selection', nargs='?', default='all', choices=['all', 'Utenti_maschio', 'Utenti_femmina', 'Atrio', 'Agenti'])
    main(parser.parse_args().selection)
