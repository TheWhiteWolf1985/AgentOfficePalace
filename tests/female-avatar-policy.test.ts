import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('female policy accepts the fixed-bow extension without weakening rig or accessory constraints', () => {
  const script = String.raw`
from pathlib import Path
import copy,json,sys
sys.path.insert(0, 'scripts')
from import_characters import validate
raw=Path('src/client/models/female_base.glb').read_bytes()
c=json.loads(Path('Personaggi/Utenti_maschio/resources/constraints.json').read_text())
manifest=json.loads(Path('tests/fixtures/avatar-manifests/female_base.manifest.json').read_text())
contract=c
assert validate('female_base',raw,c,manifest)[0]['status']=='PASS'
assert c['profiles']['human']['limits']['materials']==8 and len(manifest['deviations'])==1
cases=[]
bad=copy.deepcopy(manifest);bad['material_roles']['bow']='char_mat_tie';cases.append((c,bad))
bad=copy.deepcopy(c);bad['profiles']['human']['nodes']['char_head']['translation'][1]+=0.2;cases.append((bad,manifest))
bad=copy.deepcopy(manifest);bad['deviations'].append({'field':'rig'});cases.append((c,bad))
for contract,value in cases:
 try:validate('female_base',raw,contract,value)
 except ValueError:pass
 else:raise AssertionError('Invalid female change accepted')
print('FEMALE_POLICY_NEGATIVE_CASES_PASS')
`;
  assert.match(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', script], { encoding: 'utf8' }), /FEMALE_POLICY_NEGATIVE_CASES_PASS/);
});
