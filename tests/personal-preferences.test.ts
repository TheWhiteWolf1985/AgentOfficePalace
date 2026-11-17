import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PersonalPreferencesStore } from '../src/server/personal-preferences.js';
import { applyPreferences, defaultSettings } from '../src/shared/personal-settings.js';
import { preferencesRoute } from '../src/server/http/routes/preferences.js';
import type { Ctx } from '../src/server/office/context.js';
import { DEFAULT_AVATAR_COLORS } from '../src/shared/avatar-colors.js';

test('personal appearance and settings persist independently per account without rewriting credentials', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'personal-preferences-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'accounts.json'), 'credential-file-unchanged');
  const store = new PersonalPreferencesStore(root);
  const colors = { ...DEFAULT_AVATAR_COLORS, skin: '#112233', hair: '#223344', shirt: '#334455', bow: '#445566' };
  const profile = { color: '#123456', look: { skin: 2, hair: 1, style: 0, model: 'female', hairstyle: 'bun', colors } };
  const a = store.update('a', { profile, settings: { view: 'third', volume: 0.35, hud: { people: true } }, role: 'admin', name: 'Ignored' });
  store.update('b', { profile: { color: '#abcdef' }, settings: { muted: true } });
  const restarted = new PersonalPreferencesStore(root);
  assert.deepEqual(restarted.get('a'), a);
  assert.equal(restarted.get('a')!.profile!.look!.model, 'female');
  assert.equal(restarted.get('a')!.profile!.look!.hairstyle, 'bun');
  assert.deepEqual(restarted.get('a')!.profile!.look!.colors, colors);
  assert.equal(restarted.get('a')!.settings!.volume, .35);
  assert.equal(restarted.get('b')!.settings!.muted, true);
  assert.equal(restarted.get('a')!.settings!.muted, false);
  assert.equal(readFileSync(path.join(root, 'accounts.json'), 'utf8'), 'credential-file-unchanged');
  assert.ok(!JSON.stringify(a).includes('admin') && !JSON.stringify(a).includes('Ignored'));
  assert.deepEqual(store.update('a', { settings: { volume: 1 } }, true), a, 'migration from another browser cannot replace an existing profile');
  store.update('a', { settings: { notify: false } });
  assert.equal(store.get('a')!.settings!.volume, .35, 'partial saves preserve other devices settings');
  store.update('a', { profile: { color: '#654321' } });
  assert.equal(store.get('a')!.profile!.look!.model, 'female', 'a 2D profile save keeps the 3D avatar');
});

test('retry after a lost acknowledgement cannot overwrite a newer change from another browser', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preferences-retry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new PersonalPreferencesStore(root), a = 'a'.repeat(32), b = 'b'.repeat(32);
  store.update('person', { settings: { volume: .2 } }, false, { device: a, sequence: 1 });
  store.update('person', { settings: { volume: .8 } }, false, { device: b, sequence: 1 });
  const replay = new PersonalPreferencesStore(root).update('person', { settings: { volume: .2 } }, false, { device: a, sequence: 1 });
  assert.equal(replay.settings!.volume, .8);
  store.update('person', { settings: { view: 'third' } }, false, { device: a, sequence: 2 });
  assert.equal(store.get('person')!.settings!.volume, .8);
  assert.equal(store.sequence('person', a), 2);
});

test('invalid preferences are bounded and damaged storage is never overwritten', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preferences-damaged-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const s = applyPreferences({}, { settings: { volume: 99, hud: { chat: false, secret: true }, pins: ['x', 'x', 1, 'y'.repeat(100)], notify: 'yes' } }).settings!;
  assert.equal(s.volume, 1); assert.deepEqual(s.pins, ['x']); assert.equal(s.hud.chat, false); assert.equal(s.notify, defaultSettings().notify);
  assert.throws(() => applyPreferences({}, { profile: { color: '<script>' } }));
  const file = path.join(root, 'personal-preferences.json');writeFileSync(file, '{broken');
  const store = new PersonalPreferencesStore(root);
  assert.throws(() => store.update('a', { settings: { volume: .2 } }));
  assert.equal(readFileSync(file, 'utf8'), '{broken');
});

test('preferences HTTP uses the authenticated owner, refuses shared access and foreign origins', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preferences-http-'));
  const accounts = new Set(['a', 'b']);
  const store = new PersonalPreferencesStore(root);
  const ctx = { cfg: { trustProxy: false }, accounts: { get: (id: string) => accounts.has(id) ? { id } : undefined }, preferences: store } as unknown as Ctx;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost'), id = req.headers['x-test-account'];
    void preferencesRoute.handle(ctx, { req, res, url, path: url.pathname, session: { ...(id ? { account: { id } } : {}) } as any });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  assert.equal((await fetch(base)).status, 403);
  assert.equal((await fetch(base, { method: 'POST', headers: { 'x-test-account': 'a', Origin: 'http://elsewhere.invalid' }, body: '{}' })).status, 403);
  const response = await fetch(base, { method: 'POST', headers: { 'x-test-account': 'a', Origin: base }, body: JSON.stringify({ account: 'b', settings: { volume: .2 } }) });
  assert.equal(response.status, 200); assert.equal((await response.json() as any).account, 'a'); assert.equal(store.get('b'), null);
  accounts.delete('a'); assert.equal((await fetch(base, { headers: { 'x-test-account': 'a' } })).status, 403);
});
