import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
    "import { existsSync } from 'node:fs';",
    "const realTimer = setTimeout; globalThis.setTimeout = (f, ms, ...args) => realTimer(f, ms > 590000 && existsSync(new URL('./expire', import.meta.url)) ? 80 : ms, ...args);",
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
  const tunnelLogin = { id, browser, origin: 'https://192.0.2.1' };
  assert.equal((await call('admin/tunnel', { ...tunnelLogin, id: 'canva' })).status, 400);
  assert.equal((await call('admin/tunnel', { ...tunnelLogin, origin: 'http://office.example.org' })).status, 400);
  const prepare = async () => {
    const r = await call('admin/tunnel', { ...tunnelLogin, redirect: 'http://other.invalid/', port: 22 });
    assert.equal(r.status, 200);
    const plan = r.data, local = new URL(plan.url);
    assert.equal(local.origin + local.pathname, redirect);
    const files = (await readdir(dir)).filter(n => /^auth-.*\.sock$/.test(n));
    assert.equal(files.length, 1);
    const file = path.join(dir, files[0]!);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.ok(plan.command.includes('127.0.0.1:4600:' + file));
    async function forward(target: string, method = 'GET', host = local.host) {
      return new Promise<{ status: number; location?: string }>((resolve, reject) => {
        const req = http.request({ socketPath: file, method, path: target, headers: { host }, agent: false }, res => {
          res.resume(); res.on('end', () => resolve({ status: res.statusCode!, location: res.headers.location }));
        });
        req.on('error', reject); req.end();
      });
    }
    const entry = await forward(local.pathname + local.search);
    assert.equal(entry.status, 303);
    const auth = new URL(entry.location!);
    assert.equal(auth.origin, 'https://accounts.google.com');
    assert.equal(auth.searchParams.get('redirect_uri'), redirect);
    const state = auth.searchParams.get('state')!, code = auth.searchParams.get('code_challenge')!;
    return { forward, plan, file, state, complete: (query: string) => forward(local.pathname + '?state=' + state + '&' + query), code };
  };
  await t.test('callback-only socket, browser binding, private catalogue, single-use grant', async () => {
    const a = await prepare();
    assert.equal((await call('admin/tunnel', { ...tunnelLogin, browser: 'other' })).status, 409);
    assert.equal((await call('admin/begin', login)).status, 409);
    assert.equal((await call('admin/status', { browser })).data.providers[0].tunnel.command, a.plan.command);
    assert.equal((await call('admin/status', { browser: 'other' })).data.providers[0].tunnel, undefined);
    assert.equal((await call('worker/tunnel', tunnelLogin)).status, 404);
    assert.equal((await call('worker/use', { name: 'admin/tunnel' })).status, 404);
    assert.doesNotMatch(JSON.stringify((await call('worker/list')).data), /auth-|tunnel|ssh /i);
    for (const target of ['/', '/api/plugins', '/admin/status']) assert.equal((await a.forward(target)).status, 404);
    assert.equal((await a.complete('code=x&error=denied')).status, 400);
    const callback = '/api/plugins/callback/drive?state=' + a.state + '&code=' + a.code;
    assert.equal((await a.forward(callback, 'POST')).status, 404);
    assert.equal((await a.forward(callback, 'GET', 'office.example.org')).status, 404);
    assert.equal((await a.forward(callback + '&state=duplicate')).status, 400);
    assert.equal((await call('admin/finish', { ...login, state: a.state, code: a.code })).status, 400);
    const handoff = await a.forward(callback);
    assert.equal(handoff.status, 303);
    const url = new URL(handoff.location!);
    assert.equal(url.origin + url.pathname, tunnelLogin.origin + '/api/plugins/callback/drive');
    assert.deepEqual([...url.searchParams.keys()], ['receipt']);
    await assert.rejects(() => a.forward(callback));
    const receipt = url.searchParams.get('receipt');
    assert.equal((await call('admin/finish', { id, receipt, browser: 'other' })).status, 400);
    assert.equal((await call('admin/finish', { id, receipt, browser })).status, 200);
    assert.equal((await call('admin/finish', { id, receipt, browser })).status, 400);
    assert.equal((await call('admin/status')).data.providers[0].account, 'reader@example.org');
  });
  await t.test('administrator cancellation and provider denial preserve the previous connection', async () => {
    const a = await prepare();
    assert.equal((await call('admin/cancel', { id, browser: 'other' })).status, 400);
    assert.equal((await call('admin/cancel', { id, browser })).status, 200);
    await assert.rejects(stat(a.file), { code: 'ENOENT' });
    const b = await prepare();
    const denied = await b.complete('error=access_denied');
    const receipt = new URL(denied.location!).searchParams.get('receipt');
    assert.equal((await call('admin/finish', { id, receipt, browser })).data.error, 'Sign-in was cancelled.');
    assert.equal((await call('admin/status')).data.providers[0].account, 'reader@example.org');
  });
  await t.test('deadline closes the callback and releases the provider for the next request', async () => {
    await writeFile(path.join(dir, 'expire'), '');
    const a = await prepare();
    for (let i = 0; i < 120 && (await readdir(dir)).includes(path.basename(a.file)); i++) await delay(25);
    await assert.rejects(stat(a.file), { code: 'ENOENT' });
    assert.equal((await call('admin/status', { browser })).data.providers[0].tunnel, undefined);
    await start();
  });
});
