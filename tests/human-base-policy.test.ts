import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('human color policy accepts the reviewed budgets while rejecting unrelated rig, role and budget changes', () => {
  const script = String.raw`
from pathlib import Path
import copy,json,sys
sys.path.insert(0, 'scripts')
from import_characters import validate
raw=Path('src/client/models/human_base.glb').read_bytes()
c=json.loads(Path('Personaggi/Utenti_maschio/resources/constraints.json').read_text())
manifest=json.loads(Path('tests/fixtures/avatar-manifests/human_base.manifest.json').read_text())
contract=c
assert validate('human_base',raw,c,manifest)[0]['status']=='PASS'
assert c['profiles']['human']['limits']['materials']==8 and len(manifest['deviations'])==1
cases=[]
bad=copy.deepcopy(manifest);bad['material_roles']['pants']='char_mat_clothing';cases.append((contract,bad))
bad=copy.deepcopy(manifest);bad['deviations'].append({'field':'rig','actual':1});cases.append((contract,bad))
bad=copy.deepcopy(contract);bad['profiles']['human']['nodes']['char_head']['translation'][1]+=0.2;cases.append((bad,manifest))
bad=copy.deepcopy(contract);bad['profiles']['human']['limits']['triangles']=1;cases.append((bad,manifest))
for contract,bad in cases:
 try:validate('human_base',raw,contract,bad)
 except ValueError:pass
 else:raise AssertionError('Invalid change accepted')
print('POLICY_AND_NEGATIVE_CASES_PASS')
`;
  const output = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', script], { encoding: 'utf8' });
  assert.match(output, /POLICY_AND_NEGATIVE_CASES_PASS/);
});
