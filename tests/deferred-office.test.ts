import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createDeferredOffice, ensureOffice, officeLoaded, whenOfficeReady } from '../src/client/world/deferred-office.js';
import { createNightParts } from '../src/client/world/night.js';
import type { Office } from '../src/client/world/types.js';
import { OrderedInbox } from '../src/client/async-messages.js';

test('shared spaces hold stable empty office containers and the first project builds only once', async () => {
  let release!: () => void, prepared = 0, built = 0, mounted = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const office = createDeferredOffice(createNightParts(), async () => { prepared++; await gate; }, resources => {
    built++; resources.group.add(new Group()); resources.colliders.push({ minX: 0, maxX: 1, minZ: 0, maxZ: 1, top: 0 });
    return { ...resources, fixtures: () => [], setLook() {}, setLevel() {}, update() {}, tvScreen: 'ready' } as unknown as Office;
  });
  const colliders = office.colliders, group = office.group;
  whenOfficeReady(office, () => { mounted++; });
  assert.equal(officeLoaded(office), false); assert.equal(group.children.length, 0); assert.equal(office.desks.size, 0);
  assert.throws(() => office.tvScreen, /not loaded/);
  const a = ensureOffice(office), b = ensureOffice(office); assert.equal(a, b); release(); await a;
  assert.equal(officeLoaded(office), true); assert.equal(office.colliders, colliders); assert.equal(office.group, group);
  assert.equal(colliders.length, 1); assert.equal(mounted, 1); assert.equal(prepared, 1); assert.equal(built, 1);
  await ensureOffice(office); assert.equal(built, 1);
});

test('a failed construction can retry without duplicate geometry, collisions or light registrations', async () => {
  let attempt = 0;
  const night = createNightParts();
  const office = createDeferredOffice(night, async () => {}, resources => {
    resources.group.add(new Group()); resources.colliders.push({ minX: 0, maxX: 1, minZ: 0, maxZ: 1, top: 0 });
    night.lamps.push({ x: 0, y: 1, z: 0, reach: 1, color: '#ffffff', power: 1 });
    if (!attempt++) throw new Error('retry');
    return { ...resources } as Office;
  });
  const gallery = new Group(); office.group.add(gallery);
  await assert.rejects(ensureOffice(office), /retry/);
  assert.equal(officeLoaded(office), false); assert.deepEqual(office.group.children, [gallery]); assert.equal(office.colliders.length, 0); assert.equal(night.lamps.length, 0);
  await ensureOffice(office); assert.equal(office.group.children.length, 2); assert.equal(office.colliders.length, 1); assert.equal(night.lamps.length, 1);
});

test('resource preparation preserves wire order and discards completions from closed connections', async () => {
  const delivered: number[] = []; let release!: () => void, active = true;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const inbox = new OrderedInbox<number>(value => value === 1 ? gate : undefined, value => delivered.push(value), () => active, error => { throw error; });
  const first = inbox.push(1), next = inbox.push(2); await Promise.resolve(); assert.deepEqual(delivered, []);
  release(); await Promise.all([first, next]); assert.deepEqual(delivered, [1, 2]);
  let finish!: () => void; const stale = new OrderedInbox<number>(() => new Promise<void>(resolve => { finish = resolve; }), value => delivered.push(value), () => active, () => {});
  const pending = stale.push(3); await Promise.resolve(); active = false; finish(); await pending; assert.deepEqual(delivered, [1, 2]);
});
