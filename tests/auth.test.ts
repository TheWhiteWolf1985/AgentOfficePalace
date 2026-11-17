import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Auth } from '../src/server/auth.js';
import type { Accounts } from '../src/server/accounts.js';
import type { IncomingMessage } from 'node:http';

const auth = () => new Auth(randomBytes(32), randomBytes(16), 'secret', {} as Accounts);

test('a sign-in link works once', () => {
  const a = auth();
  const key = a.linkKey();
  assert.match(key, /^[\w-]{32}$/);
  assert.equal(a.useLinkKey(key), true);
  assert.equal(a.useLinkKey(key), false);
});

test("a made-up or empty key isn't a sign-in link, and another office's isn't either", () => {
  const a = auth();
  a.linkKey();
  assert.equal(a.useLinkKey(''), false);
  assert.equal(a.useLinkKey('x'.repeat(32)), false);
  assert.equal(a.useLinkKey(auth().linkKey()), false);
});

test('only the newest sign-in links are kept', () => {
  const a = auth();
  const first = a.linkKey();
  const later = Array.from({ length: 8 }, () => a.linkKey());
  assert.equal(a.useLinkKey(first), false);
  for (const key of later) assert.equal(a.useLinkKey(key), true);
});

test('only this application’s encrypted sibling accepts the primary cookie, without overriding its own identity', () => {
  const member = { id: 'member', name: 'Member', role: 'member' };
  const a = new Auth(randomBytes(32), randomBytes(16), 'secret', { sharedPassword: true, get: (id: string) => id === member.id ? member : undefined } as Accounts);
  a.setSecureSibling(4600, 4643);
  const primary = `ao_session_4600=${a.issue()}`, own = `ao_session_4643=${a.issue('member')}`;
  const req = (cookie: string, encrypted = true, port = 4643) => ({ headers: { host: `office:${port}`, cookie }, socket: { encrypted, localPort: port } }) as unknown as IncomingMessage;
  assert.deepEqual(a.fromRequest(req(primary)), {});
  assert.equal(a.fromRequest(req(primary, false)), undefined);
  assert.equal(a.fromRequest(req(primary, true, 4700)), undefined);
  assert.equal(a.fromRequest(req(`${primary}; ao_session_4643=invalid`)), undefined);
  assert.equal(a.fromRequest(req(`${primary}; ${own}`))?.account, member);
  assert.equal(a.clearCookies(req(own)).length, 2);
});
