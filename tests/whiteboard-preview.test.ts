import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewScheduler } from '../src/client/features/whiteboard/preview.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

test('covered boards do no work and render only the latest synchronized contents when visible', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let visible = false, data = 0;
  const rendered: number[] = [];
  const scheduler = new PreviewScheduler(() => visible, async current => { if (current()) rendered.push(data); });
  for (let i = 0; i < 40; i++) { data = i; scheduler.invalidate(); }
  t.mock.timers.tick(10_000); await flush(); assert.deepEqual(rendered, []);
  visible = true; scheduler.invalidate();
  t.mock.timers.tick(299); await flush(); assert.deepEqual(rendered, []);
  t.mock.timers.tick(1); await flush(); assert.deepEqual(rendered, [39]);
  t.mock.timers.tick(10_000); await flush(); assert.deepEqual(rendered, [39], 'no recurring idle export');
});

test('presentation, hidden tab and editor opening cancel a queued preview before drawing begins', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let covered = false, calls = 0;
  const scheduler = new PreviewScheduler(() => !covered, async () => { calls++; });
  for (let i = 0; i < 3; i++) {
    covered = false; scheduler.invalidate(); t.mock.timers.tick(200);
    covered = true; scheduler.invalidate(); t.mock.timers.tick(1000); await flush();
    assert.equal(calls, i);
    covered = false; scheduler.invalidate(); t.mock.timers.tick(300); await flush();
    assert.equal(calls, i + 1);
  }
});

test('continuous visible strokes coalesce without postponing the preview until drawing stops', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let data = 0; const shown: number[] = [];
  const scheduler = new PreviewScheduler(() => true, async () => { shown.push(data); });
  scheduler.invalidate();
  for (let i = 1; i <= 6; i++) { data = i; scheduler.invalidate(); t.mock.timers.tick(50); await flush(); }
  assert.deepEqual(shown, [6], 'a stream of strokes still refreshes the visible board every 300 ms');
  data = 7; scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  assert.deepEqual(shown, [6, 7]);
});

test('new updates during an export discard stale output and serialize the latest preview', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(); let value = 1, calls = 0;
  const shown: number[] = [];
  const scheduler = new PreviewScheduler(() => true, async current => {
    const captured = value;
    if (++calls === 1) await first.promise;
    if (current()) shown.push(captured);
  });
  scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  value = 2; scheduler.invalidate(); value = 3; scheduler.invalidate();
  t.mock.timers.tick(3000); await flush(); assert.equal(calls, 1);
  first.resolve(); await flush(); assert.deepEqual(shown, []);
  t.mock.timers.tick(300); await flush(); assert.deepEqual(shown, [3]); assert.equal(calls, 2);
});

test('a floor A to B to A visit invalidates old async work even with the same visible target', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let visible = true, count = 0;
  const shown: number[] = [];
  const scheduler = new PreviewScheduler(() => visible, async current => {
    const visit = ++count; if (visit === 1) await pending.promise;
    if (current()) shown.push(visit);
  });
  scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  visible = false; scheduler.invalidate(); visible = true; scheduler.invalidate();
  pending.resolve(); await flush(); assert.deepEqual(shown, []);
  t.mock.timers.tick(300); await flush(); assert.deepEqual(shown, [2]);
});

test('covering an in-flight export prevents painting and retries on return', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred(); let visible = true, count = 0, paints = 0;
  const scheduler = new PreviewScheduler(() => visible, async current => {
    count++; await pending.promise; if (current()) paints++;
  });
  scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  visible = false; scheduler.invalidate(); pending.resolve(); await flush();
  t.mock.timers.tick(3000); await flush(); assert.equal(paints, 0); assert.equal(count, 1);
  visible = true; scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  assert.equal(paints, 1); assert.equal(count, 2);
});

test('a failed import/export retries on a later change without a busy loop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const scheduler = new PreviewScheduler(() => true, async () => { if (++calls === 1) throw Error('offline'); });
  scheduler.invalidate(); t.mock.timers.tick(300); await flush();
  t.mock.timers.tick(10000); await flush(); assert.equal(calls, 1);
  scheduler.invalidate(); t.mock.timers.tick(300); await flush(); assert.equal(calls, 2);
});
