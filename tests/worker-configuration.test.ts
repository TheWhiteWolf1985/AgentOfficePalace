import test from 'node:test';
import assert from 'node:assert/strict';
import { configureWorker } from '../src/server/workers/configure.js';
import type { Worker, WorkerContext } from '../src/server/workers/types.js';
import type { WorkerConfiguration } from '../src/shared/connections.js';

function fixture() {
  const input: WorkerConfiguration = { name: 'Reader', color: '#112233', deskId: 'desk-1', provider: 'codex', model: 'gpt-6.1-terra', effort: 'high', prompt: 'Read sources' };
  const worker = { info: { id: 'agent1', kind: 'agent', status: 'idle', ...input }, bootBlocked: false } as Worker;
  let saves = 0;
  const ctx = { workers: new Map([['agent1', worker]]), emit() {}, persist() { saves++; }, resume() {} } as unknown as WorkerContext;
  return { input, worker, ctx, saves: () => saves };
}
test('agent metadata can be updated without launching a session or changing engine state', async () => {
  const f = fixture();
  await configureWorker(f.ctx, 'agent1', { ...f.input, name: 'New name', color: '#334455' });
  assert.equal(f.worker.info.name, 'New name'); assert.equal(f.worker.info.model, 'gpt-6.1-terra'); assert.equal(f.saves(), 1);
});
test('engine changes cannot interrupt a working agent or a pending user question', async () => {
  for (const status of ['working', 'needs_input'] as const) {
    const f = fixture(); f.worker.info.status = status;
    await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, model: 'gpt-6.1', restart: true }), /completare il turno/);
    assert.equal(f.worker.info.model, f.input.model); assert.equal(f.saves(), 0);
  }
});
test('invalid names, models and occupied desks leave the agent unchanged', async () => {
  const f = fixture();
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, model: 'invalid model' }));
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, name: '' }));
  f.ctx.workers.set('agent2', { info: { id: 'agent2', deskId: 'desk-2' } } as Worker);
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, deskId: 'desk-2' }), /occupata/);
  assert.equal(f.saves(), 0);
});
