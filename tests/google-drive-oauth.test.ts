import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { googleDriveSignInOrigin } from '../src/shared/google-drive-oauth.js';
import { Auth } from '../src/server/auth.js';
import type { Accounts } from '../src/server/accounts.js';
import { requestHandler } from '../src/server/http/router.js';
import { pluginsRoute } from '../src/server/http/routes/plugins.js';
import type { Ctx } from '../src/server/office/context.js';

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
  const socketDir = path.join(dir, 'plugin-skills', 'socket');
  await mkdir(socketDir, { recursive: true });
  const socket = path.join(socketDir, 'plugins.sock');
  const clientId = 'demo.apps.googleusercontent.com';
  const pastedUrl = 'https://example.invalid/accidental-copy';
  await writeFile(path.join(dir, 'accounts.json'), JSON.stringify({ version: 1, accounts: {}, skills: {}, clients: { drive: { clientId, secret: pastedUrl } } }));
  // Drive is simulated only at its HTTPS boundary. Run the real broker, state store and refresh logic.
  const preload = path.join(dir, 'provider.mjs');
  await writeFile(preload, [
    "import { existsSync } from 'node:fs';",
    "const realTimer = setTimeout; globalThis.setTimeout = (f, ms, ...args) => realTimer(f, ms > 590000 && existsSync(new URL('./expire', import.meta.url)) ? 80 : ms, ...args);",
    "import { createHash } from 'node:crypto';",
    "import assert from 'node:assert/strict';",
    'globalThis.fetch = async (url, options) => {',
    "  if (url instanceof URL && url.hostname === 'mcp.heygen.com') {",
    "    const endpoint='https://mcp.heygen.com/mcp/v1/', issuer=url.origin;",
    "    if (url.pathname.endsWith('/register')) return Response.json({client_id:'office'});",
    "    if (url.pathname.includes('oauth-protected-resource')) return Response.json({resource:endpoint,authorization_servers:[issuer]});",
    "    if (url.pathname.includes('oauth-authorization-server')) return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',registration_endpoint:issuer+'/register'});",
    "    if (!options.body) return new Response(null,{status:405});",
    "    const msg=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer heygen-test');",
    "    if(msg.method==='notifications/initialized')return new Response(null,{status:202});",
    "    assert.ok(['initialize','tools/list'].includes(msg.method));",
    "    return Response.json({jsonrpc:'2.0',id:msg.id,result:msg.id===1?{protocolVersion:'2025-06-18',capabilities:{tools:{}}}:{tools:[]}});",
    "  }",
    "  if (url === 'https://mcp.heygen.com/token') return Response.json({access_token:'heygen-test',refresh_token:'offline-test',expires_in:3600});",
    "  if (url === 'https://www.linkedin.com/oauth/v2/accessToken') return Response.json({access_token:'member',expires_in:1});",
    "  if (url === 'https://api.linkedin.com/v2/userinfo') return Response.json({sub:'member-id',name:'Marta'});",
    "  if (url === 'https://oauth2.googleapis.com/token') {",
    '    const b = options.body;',
    "    assert.equal(b.get('client_id'), 'demo.apps.googleusercontent.com');",
    "    assert.equal(b.get('client_secret'), 'test-secret');",
    "    if (b.get('code') === 'client-failure') return Response.json({error:'invalid_client',error_description:'sensitive diagnostic'}, {status:401});",
    "    if (b.get('code') === 'grant-failure') return Response.json({error:'invalid_grant',error_description:'sensitive diagnostic'}, {status:400});",
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
  await t.test('LinkedIn login without refresh expires, leaves the catalogue and can be disconnected', async () => {
    const id = 'linkedin', browser = 'member-browser';
    const started = await call('admin/begin', {id, browser, redirect:'https://office.example.org/api/plugins/callback/linkedin', clientId:'office', secret:'fixture'});
    assert.equal(started.status,200);
    const state = new URL(started.data.url).searchParams.get('state');
    assert.equal((await call('admin/finish',{id,browser:'another',state,code:'fixture'})).status,400);
    assert.equal((await call('admin/finish',{id,browser,state,code:'fixture'})).status,200);
    assert.equal((await call('worker/use',{name:'linkedin.profile'})).data.name,'Marta');
    assert.equal((await call('worker/use',{name:'linkedin.publish'})).status,404);
    await delay(1050);
    assert.equal((await call('admin/status')).data.providers.find((p: any) => p.id === id).status,'reconnect');
    assert.equal((await call('worker/list')).data.tools.some((tool: any) => tool.name === 'linkedin.profile'),false);
    assert.equal((await call('worker/use',{name:'linkedin.profile'})).status,409);
    assert.equal((await call('admin/disconnect',{id})).status,200);
  });
  await t.test('HeyGen shared sign-in connects the broker and exposes only the connection check', async () => {
    const id = 'heygen', browser = 'marketing-browser';
    const result = await call('admin/begin',{id,browser,redirect:'https://office.example.org/api/plugins/callback/heygen'});
    assert.equal(result.status,200);
    const state = new URL(result.data.url).searchParams.get('state');
    assert.equal((await call('admin/finish',{id,browser:'other',state,code:'ok'})).status,400);
    assert.equal((await call('admin/finish',{id,browser,state,code:'ok'})).status,200);
    assert.doesNotMatch(JSON.stringify((await call('admin/status')).data),/heygen-test|offline-test/);
    assert.deepEqual((await call('worker/list')).data.tools.map((tool: any) => tool.name), ['heygen.status']);
    assert.equal((await call('worker/use',{name:'heygen.status'})).data.connected,true);
    assert.equal((await call('admin/disconnect',{id})).status,200);
    assert.equal((await call('worker/use',{name:'heygen.status'})).status,409);
  });
  const id = 'drive', browser = 'browser-one', redirect = 'http://127.0.0.1:4600/api/plugins/callback/drive';
  const login = { id, browser, redirect };
  await t.test('a saved URL explains the setup issue, blocks consent and can be repaired with the secret alone', async () => {
    const info = (await call('admin/status')).data.providers[0];
    assert.equal(info.hasClient, true);
    assert.match(info.clientIssue, /web address/);
    assert.doesNotMatch(JSON.stringify(info), /accidental-copy/);
    for (const op of ['admin/begin', 'admin/tunnel']) {
      const invalid = await call(op, { ...login, origin: 'https://192.0.2.1' });
      assert.equal(invalid.status, 400); assert.equal(invalid.data.error, info.clientIssue);
    }
    assert.deepEqual(await readdir(socketDir), ['plugins.sock']);
    const repaired = await call('admin/client', { id, clientId: '', secret: 'test-secret' });
    assert.equal(repaired.status, 200);
    assert.equal(repaired.data.providers[0].clientIssue, undefined);
    for (const secret of [pastedUrl, '••••1234', clientId]) {
      assert.equal((await call('admin/client', { id, clientId, secret })).status, 400);
    }
    const saved = JSON.parse(await readFile(path.join(dir, 'accounts.json'), 'utf8'));
    assert.deepEqual(saved.clients.drive, { clientId, secret: 'test-secret' });
  });
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
  await t.test('a rejected Google client and an invalid one-time code give distinct repair instructions', async () => {
    for (const [code, expected] of [['client-failure', 'active client secret'], ['grant-failure', 'new Google sign-in']]) {
      const failure = await call('admin/finish', { ...await start(), code });
      assert.ok(failure.status >= 400);
      assert.ok(failure.data.error.includes(expected));
      assert.doesNotMatch(JSON.stringify(failure.data), /sensitive diagnostic|test-secret/);
    }
    assert.equal((await call('admin/status')).data.providers[0].status, 'connected');
  });
  assert.deepEqual((await call('worker/use', { name: 'drive.search' })).data, { files: [] });
  const detached = await call('admin/disconnect', { id });
  assert.equal(detached.data.providers[0].hasClient, true);
  assert.equal(detached.data.providers[0].status, 'disconnected');
  assert.equal((await call('worker/use', { name: 'drive.search' })).status, 409);
  assert.equal((await readFile(path.join(dir, 'accounts.json'), 'utf8')).includes('offline'), false);
  const tunnelLogin = { id, browser, origin: 'https://192.0.2.1' };
  assert.equal((await call('admin/tunnel', { ...tunnelLogin, id: 'linkedin' })).status, 400);
  assert.equal((await call('admin/tunnel', { ...tunnelLogin, origin: 'http://office.example.org' })).status, 400);
  const prepare = async () => {
    const r = await call('admin/tunnel', { ...tunnelLogin, redirect: 'http://other.invalid/', port: 22 });
    assert.equal(r.status, 200);
    const plan = r.data, local = new URL(plan.url);
    assert.equal(local.origin + local.pathname, redirect);
    const files = (await readdir(socketDir)).filter(n => /^auth-.*\.sock$/.test(n));
    assert.equal(files.length, 1);
    const file = path.join(socketDir, files[0]!);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.ok(plan.command.includes('127.0.0.1:4600:127.0.0.1:4610'));
    assert.ok(plan.command.includes("'office-tunnel'"));
    assert.ok(plan.command.includes("'-N'"));
    assert.doesNotMatch(plan.command, /Read-Host|test -S|seq 1|StrictHostKeyChecking=no/);
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
  await t.test('Office behind the IP proxy completes OAuth using only its login cookie', async t => {
    const prior = process.env.AGENT_OFFICE_CODEX_RUNTIME;
    process.env.AGENT_OFFICE_CODEX_RUNTIME = dir;
    t.after(() => {
      if (prior === undefined) delete process.env.AGENT_OFFICE_CODEX_RUNTIME;
      else process.env.AGENT_OFFICE_CODEX_RUNTIME = prior;
    });
    const auth = new Auth(Buffer.alloc(32), Buffer.alloc(16), 'fixture', { sharedPassword: true } as Accounts);
    const ctx = { auth, cfg: { trustProxy: true }, meOf: () => ({ admin: true }), services: { lookup: () => undefined } } as unknown as Ctx;
    const server = http.createServer(requestHandler(ctx, [pluginsRoute]));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const port = (server.address() as AddressInfo).port;
    const host = '192.0.2.1', first = auth.issue(), second = auth.issue();
    function office(token: string, target: string, input?: object) {
      return new Promise<{ status: number; text: string }>((resolve, reject) => {
        const req = http.request({ port, hostname: '127.0.0.1', path: target, method: input ? 'POST' : 'GET', agent: false,
          headers: { host, origin: 'https://' + host, 'x-forwarded-proto': 'https', cookie: 'ao_session=' + token } }, res => {
          let text = ''; res.setEncoding('utf8').on('data', chunk => { text += chunk; });
          res.on('end', () => resolve({ status: res.statusCode!, text }));
        });
        req.on('error', reject); req.end(input ? JSON.stringify(input) : undefined);
      });
    }
    const api = '/api/plugins';
    const opened = await office(first, api, { action: 'prepare-tunnel', id });
    assert.equal(opened.status, 200);
    const plan = JSON.parse(opened.text);
    assert.equal(JSON.parse((await office(first, api)).text).providers[0].tunnel.url, plan.url);
    assert.equal(JSON.parse((await office(second, api)).text).providers[0].tunnel, undefined);
    assert.equal((await office(second, api, { action: 'cancel-tunnel', id })).status, 400);
    const file = (await readdir(socketDir)).find(n => n.startsWith('auth-'))!;
    async function redirectFromSocket(target: URL) {
      return new Promise<URL>((resolve, reject) => {
        const req = http.get({ socketPath: path.join(socketDir, file), path: target.pathname + target.search,
          headers: { host: target.host }, agent: false }, res => {
          res.resume();
          if (res.statusCode !== 303 || !res.headers.location) return reject(Error('Expected browser redirect'));
          resolve(new URL(res.headers.location));
        });
        req.on('error', reject);
      });
    }
    const google = await redirectFromSocket(new URL(plan.url));
    const back = new URL(google.searchParams.get('redirect_uri')!);
    back.searchParams.set('state', google.searchParams.get('state')!);
    back.searchParams.set('code', google.searchParams.get('code_challenge')!);
    const receipt = await redirectFromSocket(back);
    const target = receipt.pathname + receipt.search;
    assert.equal((await office(second, target)).status, 400);
    assert.equal((await office(first, target)).status, 200);
    assert.equal((await office(first, target)).status, 400);
    assert.equal(JSON.parse((await office(first, api)).text).providers[0].status, 'connected');
  });
  await t.test('deadline closes the callback and releases the provider for the next request', async () => {
    await writeFile(path.join(dir, 'expire'), '');
    const a = await prepare();
    for (let i = 0; i < 120 && (await readdir(socketDir)).includes(path.basename(a.file)); i++) await delay(25);
    await assert.rejects(stat(a.file), { code: 'ENOENT' });
    assert.equal((await call('admin/status', { browser })).data.providers[0].tunnel, undefined);
    await start();
  });
});
