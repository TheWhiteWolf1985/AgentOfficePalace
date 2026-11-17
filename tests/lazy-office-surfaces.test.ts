import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBasicMaterial } from 'three';
import { lazyResource } from '../src/client/lazy-resource.js';
import { createDeferredOffice, ensureOffice } from '../src/client/world/deferred-office.js';
import { createNightParts } from '../src/client/world/night.js';
import { installTv } from '../src/client/features/tv/index.js';
import { store } from '../src/client/state/index.js';
import type { Office } from '../src/client/world/types.js';

test('deferred resources stay absent until requested, retain identity and recover from a failed creation', () => {
  let attempts = 0;
  const resource = lazyResource(() => { if (++attempts === 1) throw new Error('unavailable'); return { canvas: 'fixture' }; });
  assert.equal(resource.peek(), undefined); assert.equal(attempts, 0);
  assert.throws(() => resource.get(), /unavailable/); assert.equal(resource.peek(), undefined);
  const value = resource.get(); assert.equal(resource.get(), value); assert.equal(resource.peek(), value); assert.equal(attempts, 2);
});

test('the office TV allocates no media in common spaces, creates its idle surface at office readiness and reuses its first video', async t => {
  const oldDocument = globalThis.document, oldFloor = store.floor, oldProject = store.project;
  const canvases: any[] = [], videos: any[] = [];
  const context = new Proxy({}, { get: (_o, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement(tag: string) {
    if (tag === 'canvas') { const c = { width: 0, height: 0, getContext: () => context };canvases.push(c);return c; }
    if (tag === 'video') { const v = { srcObject: null, plays: 0, pauses: 0, play() { this.plays++;return Promise.resolve(); }, pause() { this.pauses++; }, addEventListener() {}, removeEventListener() {} };videos.push(v);return v; }
    throw new Error('Unexpected element: ' + tag);
  } } as unknown as Document;
  t.after(() => { globalThis.document = oldDocument;store.floor = oldFloor;store.project = oldProject; });
  const material = new MeshBasicMaterial();
  const office = createDeferredOffice(createNightParts(), async () => {}, resources => ({ ...resources, tvScreen: { material }, update() {}, setLook() {}, setLevel() {}, setProjectName() {} }) as unknown as Office);
  const ctx = { office, interactions: { define() {} } } as any;
  const tv = installTv(ctx, { shares: () => [], watch() {} });
  const stream = { id: 'fixture-stream' } as MediaStream;
  store.floor = '@lobby';store.project = undefined;
  tv.show(stream);assert.equal(canvases.length, 0);assert.equal(videos.length, 0);
  store.floor = '@roof';tv.show(stream);assert.equal(canvases.length, 0);assert.equal(videos.length, 0);
  await ensureOffice(office);assert.equal(canvases.length, 1);assert.equal(videos.length, 0);
  assert.deepEqual([canvases[0].width, canvases[0].height], [1280, 720]); const idle = material.map;
  store.floor = 'fixture-project';store.project = {} as any;
  tv.show(stream);assert.equal(videos.length, 1);assert.equal(videos[0].srcObject, stream);const texture = material.map;
  tv.show(stream);assert.equal(videos[0].plays, 1);assert.equal(material.map, texture);
  store.floor = '@roof';store.project = undefined;tv.show(stream);
  assert.equal(videos[0].srcObject, null);assert.equal(videos[0].pauses, 1);assert.equal(material.map, idle);
  store.floor = 'fixture-project';store.project = {} as any;tv.show(stream);
  assert.equal(videos.length, 1);assert.equal(canvases.length, 1);assert.equal(material.map, texture);
  tv.show(null);assert.equal(material.map, idle);assert.equal(videos[0].srcObject, null);
  texture?.dispose();idle?.dispose();material.dispose();
});
