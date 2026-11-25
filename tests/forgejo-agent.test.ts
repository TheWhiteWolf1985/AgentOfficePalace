import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentAssignment } from '../src/shared/forgejo-agent.js';
import { assignForge, forgeView, retireForge, workerForge, serializeForge } from '../src/server/forgejo-agents.js';

test('roles and tenure are explicit, validated independently', () => {
  for (const role of ['operator','supervisor','chief']) for (const tenure of ['temporary','permanent'])
    assert.deepEqual(agentAssignment({role,tenure,admin:true}),{role,tenure});
  for (const value of [null,{}, {role:'admin',tenure:'permanent'}, {role:'chief',tenure:'yes'}])
    assert.throws(()=>agentAssignment(value));
});

test('existing, temporary and pending desks receive no inherited access', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(),'agent-role-unit-'));
  const previous = process.env.AGENT_OFFICE_CODEX_RUNTIME;
  process.env.AGENT_OFFICE_CODEX_RUNTIME = root;
  const id = '112233445566', floor = {id:'floor-a'};
  try {
    assert.equal(forgeView(id),undefined);
    assert.throws(()=>workerForge(id,floor));
    const temporary=await assignForge(id,floor,{role:'chief',tenure:'temporary'});
    assert.equal(temporary.status,'none'); assert.equal(temporary.username,undefined);
    const pending=await assignForge(id,floor,{role:'operator',tenure:'permanent'});
    assert.equal(pending.status,'pending'); assert.match(pending.error!,/repository privato/);
    assert.throws(()=>workerForge(id,floor));
    await assert.rejects(assignForge(id,{id:'floor-b'},{role:'chief',tenure:'permanent'}),/altro piano/);
    assert.equal(forgeView(id)?.role,'operator');
    assert.doesNotMatch(JSON.stringify(forgeView(id)),/password|secret|token/i);
    await retireForge(id);
    assert.equal(forgeView(id)?.status,'none');
    assert.throws(()=>forgeView('../outside'));
  } finally {
    if (previous) process.env.AGENT_OFFICE_CODEX_RUNTIME=previous; else delete process.env.AGENT_OFFICE_CODEX_RUNTIME;
    rmSync(root,{recursive:true,force:true});
  }
});
test('failed membership change releases the queue before the next change', async () => {
  const events:string[]=[];
  const first=serializeForge(async () => {await Promise.resolve(); events.push('first'); throw Error('first');});
  const second=serializeForge(async () => {events.push('second');});
  await assert.rejects(first); await second;
  assert.deepEqual(events,['first','second']);
});
