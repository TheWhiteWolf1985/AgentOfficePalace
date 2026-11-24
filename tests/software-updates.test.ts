import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { updateActivity, updatesRoute } from '../src/server/http/routes/updates.js';

async function call(route: typeof updatesRoute, admin: boolean, method: string, origin?: string, body = '', probe = '') {
  let status = 0, value: unknown;
  const req = Object.assign(Readable.from([Buffer.from(body)]), { headers: { host: 'office', origin, 'x-office-probe': probe }, method });
  const res = { writeHead(n: number) { status = n; return this; }, end(b: string) { value = JSON.parse(b); } };
  const floors = new Map([['office', { workers: { list: () => ['working', 'done', 'starting', 'needs_input', 'idle', 'offline'].map(status => ({ status })) } }]]);
  await route.handle({ meOf: () => ({ admin }), cfg: {}, floors } as never, { req, res, session: {} } as never);
  return { status, value };
}
test('update management restricts reads and writes to administrators and validates same-origin actions', async () => {
  assert.equal((await call(updatesRoute,false,'GET')).status,403);
  assert.equal((await call(updatesRoute,false,'POST','https://office','{"action":"check"}')).status,403);
  assert.equal((await call(updatesRoute,true,'POST','https://other','{"action":"check"}')).status,403);
  assert.equal((await call(updatesRoute,true,'PUT')).status,405);
  for (const body of ['bad','null','{"action":"shell"}','{"action":"channel","channel":"local"}','{"action":"apply","tag":"latest"}']) {
    assert.equal((await call(updatesRoute,true,'POST','https://office',body)).status,400);
  }
});
test('the updater observes incomplete turns only with its per-installation probe', async () => {
  const old = process.env.AOP_RELEASE_PROBE;
  const token = 'a'.repeat(64);
  try {
    process.env.AOP_RELEASE_PROBE = token;
    assert.equal((await call(updateActivity,true,'GET')).status,403);
    assert.equal((await call(updateActivity,true,'GET',undefined,'','x'.repeat(64))).status,403);
    assert.deepEqual(await call(updateActivity,false,'GET',undefined,'',token), { status:200, value:{busy:3} });
  } finally { if (old === undefined) delete process.env.AOP_RELEASE_PROBE; else process.env.AOP_RELEASE_PROBE = old; }
});
