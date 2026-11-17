import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_COLOR_ROLES, DEFAULT_AVATAR_COLORS, avatarColorsFromQuery, sanitizeAvatarColors } from '../src/shared/avatar-colors.js';
import { sameLook, sanitizeLook } from '../src/shared/avatar.js';
import { loadProfile, saveProfile } from '../src/client/state/persist.js';
import { presenceHandlers } from '../src/server/ws/handlers/presence.js';

test('color validation whitelists nine opaque hex values and retains safe fallbacks', () => {
  const fallback = { ...DEFAULT_AVATAR_COLORS, skin: '#010203' };
  const value = sanitizeAvatarColors({ version: 1, hair: '#ABCDEF', skin: 'red', pants: '#fff', shoes: '#123456ff', iris: 'url(x)', extra: '#abcdef' }, fallback);
  assert.equal(value.hair, '#abcdef'); assert.equal(value.skin, '#010203');
  for (const role of ['pants', 'shoes', 'iris'] as const) assert.equal(value[role], fallback[role]);
  assert.deepEqual(Object.keys(value).sort(), ['version', ...AVATAR_COLOR_ROLES].sort());
  assert.deepEqual(sanitizeAvatarColors({ version: 99, hair: '#000000' }, fallback), fallback);
  value.skin = '#ffffff'; assert.equal(fallback.skin, '#010203');
});

test('legacy profiles and older profile messages preserve their previous appearance and stored colors', () => {
  const legacy = { skin: 2, hair: 3, style: 1 };
  assert.deepEqual(sanitizeLook(legacy, legacy), legacy);
  const modern = { ...legacy, colors: { ...DEFAULT_AVATAR_COLORS, pants: '#112233' } };
  assert.deepEqual(sanitizeLook(legacy, modern), modern, 'a message without colors does not erase them');
  assert.equal(sameLook(legacy, { ...legacy, colors: { ...DEFAULT_AVATAR_COLORS } }), true);
  for (const role of AVATAR_COLOR_ROLES) assert.equal(sameLook(legacy, { ...legacy, colors: { ...DEFAULT_AVATAR_COLORS, [role]: '#ff00ff' } }), false, role);
});

test('initial connection colors reject malformed or oversized JSON and round-trip a complete palette', () => {
  const colors = { ...DEFAULT_AVATAR_COLORS, shirt: '#123abc' };
  assert.deepEqual(avatarColorsFromQuery(JSON.stringify(colors)), colors);
  for (const value of [null, '', '{', 'x'.repeat(513)]) assert.equal(avatarColorsFromQuery(value), undefined);
  assert.deepEqual(avatarColorsFromQuery('{"version":2,"skin":"#000000"}'), DEFAULT_AVATAR_COLORS);
});

test('profile storage keeps legacy fields and nine colors over reload without sharing mutable drafts', t => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) } });
  t.after(() => { if (before) Object.defineProperty(globalThis, 'localStorage', before); else delete (globalThis as any).localStorage; });
  const profile = { name: 'Ann', color: '#4f86f7', look: { skin: 2, hair: 3, style: 1, colors: { ...DEFAULT_AVATAR_COLORS, eyebrows: '#123456' } } };
  saveProfile(profile); const loaded = loadProfile()!;
  assert.deepEqual(loaded, profile);
  loaded.look!.colors!.eyebrows = '#000000'; assert.equal(loadProfile()!.look!.colors!.eyebrows, '#123456');
});

test('server profile updates validate and broadcast colors while preserving account names and older clients', () => {
  let sent: any;
  const current = { name: 'Account name', color: '#4f86f7', look: { skin: 0, hair: 0, style: 0, colors: { ...DEFAULT_AVATAR_COLORS } } };
  const client = { peer: current, accountId: 'account' }, ctx = { broadcast: (msg: any) => { sent = structuredClone(msg); } };
  presenceHandlers.profile(ctx as any, client as any, { t: 'profile', name: 'Forged name', color: '#ff00ff', look: { skin: 0, hair: 0, style: 0, colors: { ...DEFAULT_AVATAR_COLORS, skin: '#010203' } } });
  assert.equal(sent.peer.name, 'Account name'); assert.equal(sent.peer.look.colors.skin, '#010203');
  presenceHandlers.profile(ctx as any, client as any, { t: 'profile', name: '', color: '#ff00ff', look: { skin: 0, hair: 0, style: 0 } });
  assert.equal(sent.peer.look.colors.skin, '#010203');
  presenceHandlers.profile(ctx as any, client as any, { t: 'profile', name: '', color: '#ff00ff', look: { skin: 0, hair: 0, style: 0, colors: { version: 1, skin: 'invalid', pants: '#123456' } as any } });
  assert.equal(sent.peer.look.colors.skin, '#010203'); assert.equal(sent.peer.look.colors.pants, '#123456');
});
