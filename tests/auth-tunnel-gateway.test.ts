import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openCallback, startCallbackGateway, tunnelProfile } from '../bin/plugin-skills/auth-tunnel.mjs';

test('SSH callback gateway routes only live OAuth requests and never exposes broker or files', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aop-cb-'));
  const gateway = await startCallbackGateway(0, '127.0.0.1');
  const port = (gateway.address() as AddressInfo).port;
  t.after(async () => { gateway.closeAllConnections(); gateway.close(); await once(gateway, 'close'); await rm(directory, { recursive: true, force: true }); });
  const flow = await openCallback({ profile: tunnelProfile('drive', 'https://192.0.2.1'), directory, hostDirectory: directory,
    authorization: 'https://accounts.google.com/fixture', state: 'fixture-state', until: Date.now() + 60_000 });
  t.after(() => flow.close());
  const get = (target: string, method = 'GET', host = '127.0.0.1:4600') => new Promise<{ status: number; location?: string }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method, agent: false, headers: { host } }, res => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode!, location: res.headers.location }));
    }); req.on('error', reject); req.end();
  });
  const local = new URL(flow.url), probe = local.pathname + '?probe=' + local.searchParams.get('start');
  for (const target of ['/', '/admin/status', '/worker/list', '/api/plugins', '/etc/passwd', local.pathname + '?probe=wrong']) {
    assert.ok([400, 404].includes((await get(target)).status));
  }
  assert.equal((await get(probe)).status, 204);
  assert.equal((await get(probe, 'POST')).status, 404);
  assert.equal((await get(probe, 'GET', 'other.invalid')).status, 404);
  assert.equal((await get(local.pathname + local.search)).location, 'https://accounts.google.com/fixture');
  const result = await get(local.pathname + '?state=fixture-state&code=fixture-code');
  assert.equal(result.status, 303);
  assert.equal(flow.redeem(new URL(result.location!).searchParams.get('receipt')), 'fixture-code');
  assert.equal((await get(probe)).status, 404);
  assert.equal((await get(local.pathname + '?state=fixture-state&code=fixture-code')).status, 404);
});
