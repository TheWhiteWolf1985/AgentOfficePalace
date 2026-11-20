import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AGENT_IMAGE, serialWorker, dockerHome, dockerDrop } from '../src/server/workers/docker.js';
import { restoreWorkers, saveWorkers } from '../src/server/workers/persist.js';
import { newWorker } from '../src/server/workers/worker.js';
import { newTracker } from '../src/server/usage.js';
import { DESKS } from '../src/shared/layout.js';
import type { Worker } from '../src/server/workers/types.js';

test('agent creation and model discovery select the CLI version built by default', () => {
  const dockerfile = readFileSync(new URL('../deploy/codex-agent/Dockerfile', import.meta.url), 'utf8');
  const version = /^ARG CODEX_VERSION=(\d+\.\d+\.\d+)$/m.exec(dockerfile)?.[1];
  assert.ok(version);
  assert.equal(AGENT_IMAGE, `aop-codex:${version}`);
});

test('operations for one container run in order; another agent can start independently', async () => {
  const steps: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const first = serialWorker('a', async () => { steps.push('creating'); await gate; throw Error('unavailable'); });
  const rejected = assert.rejects(first, /unavailable/);
  const retry = serialWorker('a', async () => { steps.push('retry'); });
  await serialWorker('b', async () => { steps.push('another agent'); });
  assert.deepEqual(steps, ['creating', 'another agent']);
  release(); await rejected; await retry;
  assert.equal(steps.at(-1), 'retry');
});

test('a stopped Docker worker restores its identity, sign-in boundary and chosen runtime', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'docker-worker-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const id = '0123456789ab';
  const w = newWorker({ id, name: 'Ada', kind: 'agent', provider: 'codex', runtime: 'docker', paused: true,
    status: 'offline', sessionId: 'existing-session', deskId: DESKS[0].id, color: '#ffffff', acked: true,
    createdBy: 'QA', createdAt: 1, cols: 80, rows: 24, viewers: [], viewerIds: [] }, newTracker());
  w.owner = 'owner'; const file = path.join(dir, 'workers.json');
  saveWorkers(file, [w], true);
  const workers = new Map<string, Worker>(); restoreWorkers(file, workers, 'codex', () => false);
  const restored = workers.get(id)!;
  assert.equal(restored.info.runtime, 'docker'); assert.equal(restored.info.paused, true);
  assert.equal(restored.info.sessionId, 'existing-session'); assert.equal(restored.owner, 'owner');
  assert.equal(restored.hookToken, w.hookToken);
});

test('container drops resolve inside the worker-only read-only mount', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'docker-drop-'));
  const old = process.env.AGENT_OFFICE_CODEX_RUNTIME;
  process.env.AGENT_OFFICE_CODEX_RUNTIME = root;
  t.after(() => { if (old === undefined) delete process.env.AGENT_OFFICE_CODEX_RUNTIME; else process.env.AGENT_OFFICE_CODEX_RUNTIME = old; rmSync(root, { recursive: true, force: true }); });
  assert.throws(() => dockerHome('../outside'));
  assert.match(dockerDrop('0123456789ab', 'note.txt', 'text/plain', Buffer.from('hello'))!, /^\/office-drops\/[\w.-]+$/);
});
