import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { loadConfig, ensureSelfSigned } from '../src/server/config.js';
import { startServer } from '../src/server/server.js';

test('native HTTPS and HTTP share authentication and application state, and both listeners close', { timeout: 30000 }, async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'office-native-https-'));
  const cfg = loadConfig(['--home', root, '--projects', path.join(root, 'projects'), '--password', 'fixture-password-only', '--no-open']);
  cfg.port = 0; cfg.httpsPort = 0; cfg.host = '127.0.0.1';
  let office: Awaited<ReturnType<typeof startServer>> | undefined;
  t.after(() => { office?.shutdown(); rmSync(root, { recursive: true, force: true }); });
  office = await startServer(cfg, { publicDir: root });
  const httpBase = 'http://127.0.0.1:' + (office.server.address() as any).port;
  const securePort = (office.secureServer!.address() as any).port;
  assert.equal(cfg.httpsPort, securePort);
  const login = await fetch(httpBase + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'fixture-password-only' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const who = await new Promise<any>((resolve, reject) => {
    https.get({ hostname: '127.0.0.1', port: securePort, path: '/api/whoami', rejectUnauthorized: false, headers: { Cookie: cookie } }, res => {
      let body = '';res.on('data', chunk => body += chunk);res.on('end', () => { assert.equal(res.statusCode, 200); resolve(JSON.parse(body)); });
    }).on('error', reject);
  });
  assert.equal(who.me.admin, true); assert.equal(who.securePort, securePort);
  const ws = new WebSocket(`wss://127.0.0.1:${securePort}/ws?name=HTTPS-test&floor=%40roof`, { rejectUnauthorized: false, headers: { Origin: `https://127.0.0.1:${securePort}`, Cookie: cookie } });
  const welcome = await new Promise<any>((resolve, reject) => { ws.on('error', reject); ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.t === 'welcome') resolve(m); }); });
  assert.equal(welcome.floor, '@roof'); assert.equal(welcome.presentation.mode, 'whiteboard');
  const closed = new Promise<void>(resolve => ws.once('close', () => resolve()));ws.close();await closed;
  const publicCertificate = readFileSync(path.join(cfg.dataDir, 'tls-cert.pem'));
  const reused = { ...cfg, httpsTls: undefined };await ensureSelfSigned(reused);
  assert.equal(reused.httpsTls!.cert, publicCertificate.toString());
  const closedHttp = new Promise<void>(resolve => office!.server.once('close', () => resolve()));
  const closedHttps = new Promise<void>(resolve => office!.secureServer!.once('close', () => resolve()));
  office.shutdown(); await Promise.all([closedHttp, closedHttps]);
  assert.equal(office.server.listening, false); assert.equal(office.secureServer!.listening, false); office = undefined;
});
