import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('human color policy accepts the reviewed budgets while rejecting unrelated rig, role and budget changes', () => {
  const script = String.raw`
from pathlib import Path
import copy,importlib.util,json
p=Path('scripts/import-human-base.py');spec=importlib.util.spec_from_file_location('human_import',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source=Path('Personaggi/Utenti');raw=(source/'human_base.glb').read_bytes();contract=json.loads((source/'resources/constraints.json').read_text());manifest=json.loads((source/'human_base.manifest.json').read_text())
report=m.validate(raw,contract,manifest)
assert report['original_contract']['status']=='FAIL' and report['application_policy']['status']=='PASS'
assert contract['profiles']['human']['limits']['materials']==8 and len(manifest['deviations'])==2
cases=[]
bad=copy.deepcopy(manifest);bad['material_roles']['pants']='char_mat_clothing';cases.append((contract,bad))
bad=copy.deepcopy(manifest);bad['deviations'].append({'field':'rig','actual':1});cases.append((contract,bad))
bad=copy.deepcopy(contract);bad['profiles']['human']['nodes']['char_head']['translation'][1]+=0.2;cases.append((bad,manifest))
bad=copy.deepcopy(contract);bad['profiles']['human']['limits']['triangles']=1;cases.append((bad,manifest))
for contract,bad in cases:
 try:m.validate(raw,contract,bad)
 except ValueError:pass
 else:raise AssertionError('Invalid change accepted')
print('POLICY_AND_NEGATIVE_CASES_PASS')
`;
  const output = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', '-c', script], { encoding: 'utf8' });
  assert.match(output, /POLICY_AND_NEGATIVE_CASES_PASS/);
});
