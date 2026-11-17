import test from 'node:test';
import assert from 'node:assert/strict';
import { WhiteboardFiles, WhiteboardScope } from '../src/client/features/whiteboard/files.js';
import { Store } from '../src/client/state/store.js';
import { whiteboard } from '../src/client/state/slices/whiteboard.js';
import type { BinaryFileData } from '@excalidraw/excalidraw/types';

const picture = { id: 'same-picture', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 1 } as BinaryFileData;
const image = { type: 'image', fileId: picture.id };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

test('the default picture transport preserves the browser fetch receiver for both upload and download', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  // Native Window.fetch rejects when called as a method of a cache instance.
  globalThis.fetch = function(this: unknown) {
    calls++;
    return this === globalThis || this === undefined ? Promise.resolve(Response.json(picture)) : Promise.reject(new TypeError('Illegal invocation'));
  };
  try {
    const scope = { board: '@roof', active: () => true };
    const a = new WhiteboardFiles(scope, () => assert.fail('valid upload must not warn'));
    assert.equal(await a.upload(picture), true);
    const b = new WhiteboardFiles(scope, () => {});
    assert.equal((await b.load([image])).length, 1);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('the same image is independently uploaded and downloaded on each board, with captured URLs', async () => {
  const requests: string[] = [];
  const request: typeof fetch = async (url) => { requests.push(String(url)); return Response.json(picture); };
  const a = new WhiteboardFiles({ board: 'office-a', active: () => true }, () => {}, request);
  const roof = new WhiteboardFiles({ board: '@roof', active: () => true }, () => {}, request);
  const b = new WhiteboardFiles({ board: 'office-b', active: () => true }, () => {}, request);
  assert.equal(await a.upload(picture), true);
  assert.equal(roof.has(picture.id), false); assert.deepEqual(roof.snapshot(), {});
  assert.equal(await roof.upload(picture), true);
  assert.equal(await b.upload(picture), true);
  assert.deepEqual(requests, ['office-a', '%40roof', 'office-b'].map(id => '/api/whiteboard/file?floor=' + id));
  const other = new WhiteboardFiles({ board: '@roof', active: () => true }, () => {}, request);
  assert.equal((await other.load([image])).length, 1);
  assert.equal(requests.at(-1), '/api/whiteboard/file?floor=%40roof&id=same-picture');
});

test('late uploads and downloads cannot revive a disposed visit after A to B to A', async () => {
  let board = 'a'; const visit = new WhiteboardScope('a', () => board, () => {});
  const posted = deferred<Response>(), fetched = deferred<Response>();
  const files = new WhiteboardFiles(visit, () => assert.fail('stale request must not toast'), async (_url, opts) => opts?.method === 'POST' ? posted.promise : fetched.promise);
  const upload = files.upload(picture), load = files.load([image]);
  assert.equal(files.upload(picture), upload, 'one in-flight upload per image and scope');
  visit.dispose(); board = 'b'; board = 'a';
  const next = new WhiteboardScope('a', () => board, () => {});
  assert.equal(visit.active(), false); assert.equal(next.active(), true);
  posted.resolve(Response.json({ ok: true })); fetched.resolve(Response.json(picture));
  assert.equal(await upload, false); assert.deepEqual(await load, []);
  assert.deepEqual(files.snapshot(), {}); assert.equal(next.files.has(picture.id), false);
});

test('a missing picture on one board does not suppress another board, and failed uploads may retry', async () => {
  let count = 0;
  const scope = { board: '@roof', active: () => true };
  const a = new WhiteboardFiles(scope, () => {}, async () => { count++; return new Response('{}', { status: 404 }); });
  assert.deepEqual(await a.load([image]), []); assert.deepEqual(await a.load([image]), []); assert.equal(count, 1);
  const b = new WhiteboardFiles({ ...scope, board: 'b' }, () => {}, async () => { count++; return Response.json(picture); });
  assert.equal((await b.load([image])).length, 1); assert.equal(count, 2);
  let attempts = 0, warnings = 0;
  const retry = new WhiteboardFiles(scope, () => warnings++, async () => ++attempts === 1 ? new Response('{}', { status: 500 }) : Response.json({ ok: true }));
  assert.equal(await retry.upload(picture), false); assert.equal(await retry.upload(picture), true);
  assert.equal(attempts, 2); assert.equal(warnings, 1);
});

test('delayed drawing and presence frames never enter another board in the client store', () => {
  const s = new Store([whiteboard]); s.floor = '@roof';
  const element = { id: 'a', type: 'text', version: 1, versionNonce: 1 };
  s.apply({ t: 'wb.update', board: 'office-a', elements: [element] });
  s.apply({ t: 'wb.people', board: 'office-a', people: ['wrong'] });
  assert.equal(s.whiteboard.size, 0); assert.deepEqual(s.drawing, []);
  s.apply({ t: 'wb.update', board: '@roof', elements: [element] });
  s.apply({ t: 'wb.people', board: '@roof', people: ['right'] });
  assert.equal(s.whiteboard.get('a'), element); assert.deepEqual(s.drawing, ['right']);
});
