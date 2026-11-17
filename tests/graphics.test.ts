import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { DEFAULT_GRAPHICS, graphicsPolicy, RenderCadence, sanitizeGraphics } from '../src/client/graphics-settings.js';
import { ShaderWarmup } from '../src/client/core/graphics.js';

test('graphics defaults preserve high quality; device preferences reject malformed values', () => {
  for (const input of [null, [], { quality: 'broken', fps: 144 }, { fps: '30' }]) assert.deepEqual(sanitizeGraphics(input), DEFAULT_GRAPHICS);
  assert.deepEqual(sanitizeGraphics({ quality: 'balanced', fps: 30 }), { quality: 'balanced', fps: 30 });
  assert.deepEqual(graphicsPolicy({ quality: 'high', fps: 60 }, 3), { pixelRatio: 2, shadows: true, shadowSize: 2048, outline: true, fps: 60 });
  assert.deepEqual(graphicsPolicy({ quality: 'economy', fps: 30 }, 2), { pixelRatio: 1, shadows: false, shadowSize: 1024, outline: false, fps: 30 });
  assert.equal(graphicsPolicy({ quality: 'balanced', fps: 0 }, NaN).pixelRatio, 1);
});

test('render cadence limits draw work without becoming 30Hz on a jittery 60Hz display', () => {
  for (const [fps, expected] of [[60, 300], [30, 150], [0, 300]]) {
    const clock = new RenderCadence(); let draws = 0;
    for (let i = 0; i < 300; i++) if (clock.due(1000 + i * 1000 / 60 + (i % 2 ? 0.25 : -0.25), fps)) draws++;
    assert.ok(Math.abs(draws - expected) <= 1, `${fps}: ${draws}`);
  }
  const clock = new RenderCadence();
  assert.ok(clock.due(1000, 30)); assert.equal(clock.due(1008, 30), false);
  assert.ok(clock.due(1010, 15)); // Opening a dialog applies its new budget immediately.
  assert.ok(clock.due(10000, 60)); // Resuming after a pause never tries to catch up every old frame.
});

test('shader preparation coalesces visits and invalidates when quality changes', async () => {
  const root = new Object3D(); let calls = 0; let finish!: () => void;
  const warm = new ShaderWarmup(async () => { calls++; await new Promise<void>(resolve => finish = resolve); });
  const a = warm.prepare(root), b = warm.prepare(root); assert.equal(a, b);
  await Promise.resolve(); assert.equal(calls, 1); finish(); await a;
  await warm.prepare(root); assert.equal(calls, 1);
  warm.invalidate(); const c = warm.prepare(root); await Promise.resolve(); assert.equal(calls, 2); finish(); await c;
});

test('shader preparation failures remain retryable and a stalled driver cannot block travel indefinitely', async () => {
  let calls = 0; const root = new Object3D();
  const retry = new ShaderWarmup(async () => { calls++; throw new Error('driver'); });
  await retry.prepare(root); await retry.prepare(root); assert.equal(calls, 2);
  await new ShaderWarmup(() => new Promise(() => {}), 5).prepare(root);
});
