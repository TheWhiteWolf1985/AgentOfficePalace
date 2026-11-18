import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderCadence } from '../src/client/graphics-settings.js';
import { VisualClock } from '../src/client/core/visual-clock.js';
import { SunPositionCache } from '../src/client/world/sky-clock.js';
import { sunPosition } from '../src/shared/sun.js';

test('visual work follows 30/60/15 Hz while elapsed animation time and normal ticks are preserved', () => {
  for (const display of [60, 120, 144]) for (const rate of [15, 30, 60]) {
    const clock = new VisualClock(), cadence = new RenderCadence();
    let updates = 0, elapsed = 0, simulation = 0;
    for (let i = 0; i < display * 3; i++) {
      const frame = { dt: 1 / display, delta: 1 / display, t: i / display, now: i * 1000 / display };
      simulation++;
      const visual = clock.advance(frame, cadence.due(frame.now, rate), false);
      if (visual) { updates++; elapsed += visual.dt; }
    }
    assert.ok(Math.abs(updates - rate * 3) <= 1, `${display}/${rate}: ${updates}`);
    assert.ok(Math.abs(elapsed - 3) < 1 / rate + 0.001, String(elapsed));
    assert.equal(simulation, display * 3);
  }
});

test('hidden/resume and shader waits never accumulate a large visual jump', () => {
  const clock = new VisualClock();
  const frame = (dt: number) => ({ dt, delta: dt, t: 20, now: 20000 });
  assert.equal(clock.advance(frame(0.05), false, false), null);
  assert.equal(clock.advance(frame(30), false, true), null);
  assert.equal(clock.advance(frame(0.016), true, false)?.dt, 0.016);
  for (let i = 0; i < 100; i++) clock.advance(frame(0.016), false, false);
  assert.equal(clock.advance(frame(0.016), true, false)?.dt, 0.1);
  assert.equal(clock.advance(frame(0.016), true, false)?.dt, 0.016);
});

test('slow sun samples are cached within a simulated second and refresh on time/location changes', () => {
  const cache = new SunPositionCache();
  const time = Date.UTC(2026, 10, 18, 12);
  const first = cache.at(time, 45, 11);
  assert.equal(cache.at(time + 100, 45, 11), first);
  assert.deepEqual(cache.at(time + 1000, 45, 11), sunPosition(time + 1000, 45, 11));
  assert.deepEqual(cache.at(time + 1001, 0, 90), sunPosition(time + 1001, 0, 90));
  assert.deepEqual(cache.at(time - 3600000, 45, 11), sunPosition(time - 3600000, 45, 11));
});
