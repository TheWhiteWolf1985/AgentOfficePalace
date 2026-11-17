import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('female policy accepts the fixed-bow extension without weakening rig or accessory constraints', () => {
  const script = String.raw`
from pathlib import Path
import copy,importlib.util,json
spec=importlib.util.spec_from_file_location('female_import','scripts/import-female-avatar.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=Path('Personaggi/Utenti_femmina');raw=(p/'female_base.glb').read_bytes();c=json.loads((p/'resources/constraints.json').read_text());manifest=json.loads((p/'female_base.manifest.json').read_text())
r=m.validate(raw,c,manifest)
assert r['original_contract']['status']=='FAIL' and r['application_policy']['status']=='PASS'
assert c['profiles']['human']['limits']['materials']==8 and len(manifest['deviations'])==4
cases=[]
bad=copy.deepcopy(manifest);bad['fixed_accessory']['removable']=True;cases.append((c,bad))
bad=copy.deepcopy(manifest);bad['fixed_accessory']['parent']='char_hair';cases.append((c,bad))
bad=copy.deepcopy(manifest);bad['material_roles']['bow']='char_mat_tie';cases.append((c,bad))
bad=copy.deepcopy(c);bad['profiles']['human']['nodes']['char_head']['translation'][1]+=0.2;cases.append((bad,manifest))
bad=copy.deepcopy(manifest);bad['deviations'].append({'field':'rig'});cases.append((c,bad))
for contract,value in cases:
 try:m.validate(raw,contract,value)
 except ValueError:pass
 else:raise AssertionError('Invalid female change accepted')
print('FEMALE_POLICY_NEGATIVE_CASES_PASS')
`;
  assert.match(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', script], { encoding: 'utf8' }), /FEMALE_POLICY_NEGATIVE_CASES_PASS/);
});
