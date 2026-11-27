import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Auth } from '../src/server/auth.js';
import type { Accounts } from '../src/server/accounts.js';
import type { Ctx } from '../src/server/office/context.js';
import { requestHandler } from '../src/server/http/router.js';
import { pluginsRoute } from '../src/server/http/routes/plugins.js';

test('tunnel credentials require an explicit same-origin HTTPS administrator request and are never cached', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aop-ssh-'));
  const previous = process.env.AGENT_OFFICE_TUNNEL_CONFIG;
  const file = path.join(dir, 'account.json');
  process.env.AGENT_OFFICE_TUNNEL_CONFIG = file;
  t.after(async () => { if (previous === undefined) delete process.env.AGENT_OFFICE_TUNNEL_CONFIG;
    else process.env.AGENT_OFFICE_TUNNEL_CONFIG = previous; await rm(dir, { recursive: true, force: true }); });
  const fixture = { user: 'office-tunnel', password: 'A'.repeat(48), fingerprint: 'SHA256:' + 'B'.repeat(43) };
  await writeFile(file, JSON.stringify(fixture));
  const auth = new Auth(Buffer.alloc(32), Buffer.alloc(16), 'fixture', { sharedPassword: true } as Accounts);
  let admin = true;
  const ctx = { auth, cfg: { trustProxy: true }, meOf: () => ({ admin }), services: { lookup: () => undefined } } as unknown as Ctx;
  const server = http.createServer(requestHandler(ctx, [pluginsRoute]));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port, token = auth.issue();
  const call = (origin = 'https://192.0.2.1', cookie = token) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/plugins', method: 'POST', headers: {
      host: '192.0.2.1', origin, 'x-forwarded-proto': origin.startsWith('https:') ? 'https' : 'http', cookie: 'ao_session=' + cookie,
    } }, res => { let text = ''; res.setEncoding('utf8').on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text })); });
    req.on('error', reject); req.end(JSON.stringify({ action: 'tunnel-account' }));
  });
  const ok = await call();
  assert.equal(ok.status, 200); assert.deepEqual(JSON.parse(ok.text), fixture);
  assert.match(ok.headers['cache-control']!, /\bno-store\b/);
  assert.equal((await call('https://other.invalid')).status, 403);
  assert.equal((await call('http://192.0.2.1')).status, 400);
  assert.equal((await call('https://192.0.2.1', 'invalid')).status, 401);
  admin = false;
  const forbidden = await call(); assert.equal(forbidden.status, 403); assert.ok(!forbidden.text.includes(fixture.password));
  admin = true;
  await writeFile(file, '{"user":"root"}');
  const invalid = await call(); assert.equal(invalid.status, 503); assert.ok(!invalid.text.includes('root'));
});
