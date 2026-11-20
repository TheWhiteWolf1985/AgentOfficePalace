import test from 'node:test';
import assert from 'node:assert/strict';
import { DockerWorkers } from '../src/server/workers/docker-lifecycle.js';
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
test('Docker Apply saves while either agent needs input and resumes only the edited chat when idle', async () => {
  const f = fixture(), w = f.worker;
  Object.assign(w.info, { runtime: 'docker', sessionId: 'original', status: 'needs_input' });
  w.pty = {} as Worker['pty'];
  const other = { info: { id: 'agent2', deskId: 'desk-2', status: 'needs_input' } } as Worker;
  f.ctx.workers.set('agent2', other);
  const stops: string[] = [], resumes: string[] = [];
  const docker = new DockerWorkers(f.ctx);
  f.ctx.applyContainerSettings = worker => docker.applyWhenIdle(worker);
  docker.pause = async id => { stops.push(id); };
  f.ctx.resume = id => { resumes.push(id); return undefined; };
  await configureWorker(f.ctx, 'agent1', { ...f.input, model: 'gpt-6-astra', effort: 'medium' });
  assert.equal(w.info.model, 'gpt-6-astra'); assert.equal(w.info.effort, 'medium');
  assert.deepEqual(w.info.containerEngine, { model: f.input.model, effort: f.input.effort });
  for (const status of ['needs_input', 'working', 'starting'] as const) {
    w.info.status = status; docker.applyWhenIdle(w);
  }
  assert.deepEqual(stops, []);
  let text = '› Unsent draft';
  w.term = { buffer: { active: { baseY: 0, cursorY: 0, cursorX: 2,
    getLine: () => ({ translateToString: () => text, getCell: () => ({ isDim: () => false }) }) } } } as unknown as Worker['term'];
  w.info.status = 'done'; docker.applyWhenIdle(w); assert.deepEqual(stops, []);
  text = '› Ask Codex to do anything'; docker.applyWhenIdle(w);
  await Promise.resolve();
  assert.deepEqual(stops, ['agent1']); assert.deepEqual(resumes, ['agent1']);
  assert.equal(w.info.sessionId, 'original'); assert.equal(other.info.status, 'needs_input'); assert.equal(f.saves(), 1);
});

test('invalid names, models and occupied desks leave the agent unchanged', async () => {
  const f = fixture();
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, model: 'invalid model' }));
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, name: '' }));
  f.ctx.workers.set('agent2', { info: { id: 'agent2', deskId: 'desk-2' } } as Worker);
  await assert.rejects(configureWorker(f.ctx, 'agent1', { ...f.input, deskId: 'desk-2' }), /occupata/);
  assert.equal(f.saves(), 0);
});
