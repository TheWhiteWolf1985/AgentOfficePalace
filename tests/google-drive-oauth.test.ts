import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { googleDriveSignInOrigin } from '../src/shared/google-drive-oauth.js';

test('Drive suggests a loopback redirect for LAN IPs and keeps the registered origin for domains and localhost', () => {
  for (const origin of ['https://192.168.1.144', 'https://[fd00::10]:8833']) {
    assert.equal(googleDriveSignInOrigin(origin), 'http://127.0.0.1:4600');
  }
  for (const origin of ['https://office.example.org:8443', 'http://127.0.0.1:4600', 'http://localhost:8888', 'http://[::1]:8443']) {
    assert.equal(googleDriveSignInOrigin(origin), origin);
  }
});

test('Drive connects the selected user with PKCE, requires the initiating browser and keeps the client for the next login', { skip: process.platform === 'win32' }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aop-drive-'));
  const socket = path.join(dir, 'p.sock');
  // Drive is simulated only at its HTTPS boundary. Run the real broker, state store and refresh logic.
  const preload = path.join(dir, 'provider.mjs');
  await writeFile(preload, [
    "import { createHash } from 'node:crypto';",
    "import assert from 'node:assert/strict';",
    'globalThis.fetch = async (url, options) => {',
    "  if (url === 'https://oauth2.googleapis.com/token') {",
    '    const b = options.body;',
    "    assert.equal(b.get('client_id'), 'demo.apps.googleusercontent.com');",
    "    assert.equal(b.get('client_secret'), 'test-secret');",
    "    if (b.get('grant_type') === 'refresh_token') assert.equal(b.get('refresh_token'), 'offline');",
    '    else {',
    "      assert.equal(b.get('redirect_uri'), 'http://127.0.0.1:4600/api/plugins/callback/drive');",
    "      assert.equal(b.get('code'), createHash('sha256').update(b.get('code_verifier')).digest('base64url'));",
    '    }',
    "    return Response.json({ access_token: 'simulated', refresh_token: 'offline', expires_in: 1 });",
    '  }',
    "  assert.equal(options.headers.Authorization, 'Bearer simulated');",
    "  if (String(url).includes('/about?')) return Response.json({ user: { emailAddress: 'reader@example.org' } });",
    "  assert.equal(new URL(url).pathname, '/drive/v3/files');",
    '  return Response.json({ files: [] });',
    '};',
  ].join('\n'));
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'bin/plugin-skills/service.mjs'], {
    env: { ...process.env, AOP_PLUGIN_DATA_DIR: dir, AOP_PLUGIN_SOCKET: socket }, stdio: 'ignore',
  });
  const exited = once(child, 'exit');
  t.after(async () => { child.kill(); await exited; await rm(dir, { recursive: true, force: true }); });
  function call(endpoint: string, body: object = {}) {
    return new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = http.request({ socketPath: socket, path: '/' + endpoint, method: 'POST' }, res => {
        const chunks: Buffer[] = []; res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()) }));
      });
      req.on('error', reject); req.end(JSON.stringify(body));
    });
  }
  for (let tries = 0; ; tries++) {
    try { await call('admin/status'); break; }
    catch (error) { if (tries >= 120 || child.exitCode !== null) throw error; await delay(25); }
  }
  const id = 'drive', browser = 'browser-one', redirect = 'http://127.0.0.1:4600/api/plugins/callback/drive';
  const login = { id, browser, redirect };
  assert.equal((await call('admin/begin', login)).status, 400);
  assert.equal((await call('admin/service', { id, credential: {} })).status, 400);
  assert.equal((await call('admin/client', { id, clientId: 'invalid', secret: 'test-secret' })).status, 400);
  const setup = await call('admin/client', { id, clientId: 'demo.apps.googleusercontent.com', secret: 'test-secret' });
  assert.equal(setup.data.providers[0].hasClient, true);
  assert.equal(JSON.stringify(setup.data).includes('test-secret'), false);
  const start = async () => {
    const r = await call('admin/begin', login);
    assert.equal(r.status, 200);
    const url = new URL(r.data.url);
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('prompt'), 'select_account consent');
    assert.equal(url.searchParams.get('redirect_uri'), redirect);
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.readonly');
    return { id, browser, state: url.searchParams.get('state'), code: url.searchParams.get('code_challenge') };
  };
  const attempt = await start();
  assert.equal((await call('admin/finish', { ...attempt, browser: 'another-browser' })).status, 400);
  assert.equal((await call('admin/finish', { ...attempt, state: 'wrong' })).status, 400);
  assert.equal((await call('admin/finish', attempt)).status, 200);
  assert.equal((await call('admin/finish', attempt)).status, 400);
  const cancel = await start();
  assert.equal((await call('admin/finish', { ...cancel, code: '' })).status, 400);
  assert.equal((await call('admin/status')).data.providers[0].account, 'reader@example.org');
  assert.deepEqual((await call('worker/use', { name: 'drive.search' })).data, { files: [] });
  const detached = await call('admin/disconnect', { id });
  assert.equal(detached.data.providers[0].hasClient, true);
  assert.equal(detached.data.providers[0].status, 'disconnected');
  assert.equal((await call('worker/use', { name: 'drive.search' })).status, 409);
  assert.equal((await readFile(path.join(dir, 'accounts.json'), 'utf8')).includes('offline'), false);
  await start();
});
