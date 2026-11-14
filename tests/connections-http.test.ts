import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Ctx } from '../src/server/office/context.js';
import { connectionsRoute, managedProviders } from '../src/server/http/routes/connections.js';
import { connections } from '../src/server/connections/store.js';

test('central management offers only engines supported by the deployed runner', () => {
  const previous = process.env.AGENT_OFFICE_MANAGED_PROVIDERS;
  try {
    process.env.AGENT_OFFICE_MANAGED_PROVIDERS = 'codex';
    assert.deepEqual(managedProviders(['claude', 'codex', 'pi']), ['codex']);
    process.env.AGENT_OFFICE_MANAGED_PROVIDERS = 'unavailable';
    assert.deepEqual(managedProviders(['codex']), []);
    delete process.env.AGENT_OFFICE_MANAGED_PROVIDERS;
    assert.deepEqual(managedProviders(['claude', 'codex']), ['claude', 'codex']);
  } finally {
    if (previous === undefined) delete process.env.AGENT_OFFICE_MANAGED_PROVIDERS; else process.env.AGENT_OFFICE_MANAGED_PROVIDERS = previous;
  }
});

test('connection endpoints enforce admin and origin checks and never return stored credentials', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'connections-http-'));
  const previous = process.env.AGENT_OFFICE_CONNECTIONS_DIR;
  process.env.AGENT_OFFICE_CONNECTIONS_DIR = root;
  let admin = false;
  const ctx = { cfg: { trustProxy: false }, meOf: () => ({ admin }), floors: new Map() } as unknown as Ctx;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    void connectionsRoute.handle(ctx, { req, res, url, path: url.pathname, session: {} as any });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as any).port;
  try {
    assert.equal((await fetch(url + '/api/connections')).status, 403);
    admin = true;
    assert.equal((await fetch(url + '/api/connections', { method: 'POST', headers: { Origin: 'http://other.example.org', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const store = connections();
    const s = store.putServer({ provider: 'forgejo', name: 'Local', url: 'http://forgejo.example.org' });
    store.putAccount({ serverId: s.id, name: 'Reader', token: 'private_test_token' });
    const response = await fetch(url + '/api/connections');
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('private_test_token'));
    assert.equal(JSON.parse(text).accounts[0].name, 'Reader');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous === undefined) delete process.env.AGENT_OFFICE_CONNECTIONS_DIR; else process.env.AGENT_OFFICE_CONNECTIONS_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
