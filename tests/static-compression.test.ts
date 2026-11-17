import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { precompressAssets } from '../scripts/precompress-assets.mjs';
import { assetEncoding } from '../src/server/http/static.js';
import { loadConfig } from '../src/server/config.js';
import { startServer } from '../src/server/server.js';

test('asset negotiation honors exclusions, qualities, wildcard and identity preferences', () => {
  const both = ['br', 'gzip'];
  for (const [header, result] of [
    [undefined, 'identity'], ['', 'identity'], [' ', 'identity'],
    ['gzip, deflate, br, zstd', 'br'], ['GZip ; q=0.9, BR;q=0.8', 'gzip'],
    ['br;q=0,gzip;q=0.5', 'gzip'], ['br;q=0,gzip;q=0', 'identity'],
    ['br;q=0.5, identity;q=0.9', 'identity'], ['identity;q=0, *;q=0.5', 'br'],
    ['br;q=0, *;q=0.5', 'gzip'], ['*;q=0', undefined],
    ['*;q=0,identity;q=1', 'identity'], ['deflate,identity;q=0', undefined],
    ['br;q=bad,gzip;q=0.5', 'gzip'], ['br;q=2', 'identity'],
    ['br;q=0,br;q=1', 'identity'],
  ] as const) assert.equal(assetEncoding(header, both), result, String(header));
  assert.equal(assetEncoding('gzip, br', ['gzip']), 'gzip');
  assert.equal(assetEncoding('gzip, br', []), 'identity');
  assert.equal(assetEncoding('gzip, identity;q=0', []), undefined);
});

test('precompression is lossless and repeatable, skips already compressed/small assets and removes obsolete sidecars', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'office-precompress-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const original = Buffer.from('fixture geometry data / buffer values\n'.repeat(1000));
  mkdirSync(path.join(dir, 'assets'));
  const file = path.join(dir, 'assets', 'scene.glb'); writeFileSync(file, original);
  writeFileSync(path.join(dir, 'tiny.js'), 'export{}');
  writeFileSync(path.join(dir, 'font.woff2'), original);
  const first = await precompressAssets(dir);
  const br = readFileSync(file + '.br'), gz = readFileSync(file + '.gz');
  assert.deepEqual(readFileSync(file), original);
  assert.deepEqual(brotliDecompressSync(br), original); assert.deepEqual(gunzipSync(gz), original);
  assert.equal(first.files, 1); assert.ok(br.length < original.length && gz.length < original.length);
  assert.equal(existsSync(path.join(dir, 'tiny.js.br')), false); assert.equal(existsSync(path.join(dir, 'font.woff2.gz')), false);
  await precompressAssets(dir);
  assert.deepEqual(readFileSync(file + '.br'), br); assert.deepEqual(readFileSync(file + '.gz'), gz);
  writeFileSync(file, 'small now'); await precompressAssets(dir);
  assert.equal(existsSync(file + '.br'), false); assert.equal(existsSync(file + '.gz'), false);
  assert.equal(readFileSync(file, 'utf8'), 'small now');
});

test('HTTP serves negotiated static representations with original MIME, cache, HEAD and session boundaries', { timeout: 30000 }, async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'office-static-http-'));
  const publicDir = path.join(root, 'public');mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
  const asset = Buffer.from('fixture compressed asset\n'.repeat(400));
  const html = '<!doctype html><title>Fixture</title>' + '<p>Static page</p>'.repeat(100);
  for (const name of ['index.html', 'lite.html', 'login.html', 'claim.html', 'join.html']) writeFileSync(path.join(publicDir, name), html);
  writeFileSync(path.join(publicDir, 'assets', 'fixture.js'), asset);
  writeFileSync(path.join(publicDir, 'assets', 'raw.js'), 'export{}');
  await precompressAssets(publicDir);
  const cfg = loadConfig(['--home', path.join(root, 'home'), '--projects', path.join(root, 'projects'), '--password', 'fixture-password-only', '--no-open']);
  cfg.port = 0; cfg.host = '127.0.0.1';
  let office: Awaited<ReturnType<typeof startServer>> | undefined;
  t.after(() => { office?.shutdown(); rmSync(root, { recursive: true, force: true }); });
  office = await startServer(cfg, { publicDir });
  const port = (office.server.address() as any).port;
  function request(url: string, headers: Record<string, string> = {}, method = 'GET', body?: string) {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: url, headers, method }, res => {
        const chunks: Buffer[] = [];res.on('data', chunk => chunks.push(chunk));res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      });req.on('error', reject);req.end(body);
    });
  }
  for (const [accept, encoding] of [['gzip, br', 'br'], ['br;q=0,gzip;q=1', 'gzip'], ['', undefined], ['deflate', undefined]]) {
    const r = await request('/assets/fixture.js', { 'Accept-Encoding': accept! });
    assert.equal(r.status, 200); assert.equal(r.headers['content-encoding'], encoding);
    assert.equal(r.headers.vary, 'Accept-Encoding'); assert.match(r.headers['content-type']!, /javascript/);
    assert.match(r.headers['cache-control']!, /immutable/); assert.equal(Number(r.headers['content-length']), r.body.length);
    const decoded = encoding === 'br' ? brotliDecompressSync(r.body) : encoding === 'gzip' ? gunzipSync(r.body) : r.body;
    assert.deepEqual(decoded, asset);
  }
  const head = await request('/assets/fixture.js', { 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.headers['content-encoding'], 'br'); assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), readFileSync(path.join(publicDir, 'assets/fixture.js.br')).length);
  const raw = await request('/assets/raw.js', { 'Accept-Encoding': 'br,gzip' });assert.equal(raw.status, 200);assert.equal(raw.headers['content-encoding'], undefined);assert.equal(raw.body.toString(), 'export{}');
  assert.equal((await request('/assets/raw.js', { 'Accept-Encoding': 'identity;q=0,br' })).status, 406);
  assert.equal((await request('/assets/fixture.js', { 'Accept-Encoding': '*;q=0' })).status, 406);
  assert.equal((await request('/assets/fixture.js.br')).status, 404);
  assert.equal((await request('/assets/fixture.js.gz')).status, 404);
  assert.equal((await request('/assets/fixture.js', {}, 'POST')).status, 405);
  const range = await request('/assets/fixture.js', { 'Accept-Encoding': 'gzip', Range: 'bytes=0-10' });
  assert.equal(range.status, 200); assert.deepEqual(gunzipSync(range.body), asset); // No partial representation support is advertised.
  assert.equal((await request('/')).status, 302);
  const login = await request('/api/login', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ password: 'fixture-password-only' }));
  assert.equal(login.status, 200); const Cookie = login.headers['set-cookie']![0].split(';')[0];
  for (const url of ['/', '/lite', '/index.html']) {
    const r = await request(url, { Cookie, 'Accept-Encoding': 'br' });
    assert.equal(r.status, 200); assert.equal(r.headers['cache-control'], 'no-store'); assert.match(r.headers['content-type']!, /text\/html/);
    assert.equal(brotliDecompressSync(r.body).toString(), html);
  }
  const health = await request('/api/health', { 'Accept-Encoding': 'br,gzip' });assert.equal(health.headers['content-encoding'], undefined);
});
