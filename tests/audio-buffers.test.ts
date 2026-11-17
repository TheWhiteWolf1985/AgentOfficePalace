import test from 'node:test';
import assert from 'node:assert/strict';
import { lazyBuffers, warmBuffers } from '../src/client/sound/buffers.js';

test('sound samples are generated only when requested, reused and warmed in separate jobs', () => {
  let allocations = 0;
  const context = { sampleRate: 8000, createBuffer(channels: number, length: number, sampleRate: number) {
    allocations++; const values = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => values } as unknown as AudioBuffer;
  } };
  const bank = lazyBuffers(context); assert.equal(allocations, 0);
  const brown = bank.brown; assert.equal(allocations, 1); assert.equal(bank.brown, brown);
  const jobs: (() => void)[] = [];
  warmBuffers(bank, job => jobs.push(job)); assert.equal(allocations, 1); assert.equal(jobs.length, 1);
  let rounds = 0;
  while (jobs.length) { assert.equal(jobs.length, 1); jobs.shift()!(); rounds++; }
  assert.equal(rounds, 9); assert.equal(allocations, 17); assert.equal(bank.brown, brown);
  assert.equal(bank.keys.length, 6); assert.equal(bank.spaces.length, 2); assert.equal(bank.steps.length, 3);
  assert.equal(bank.white.duration, 5); assert.equal(bank.brown.duration, 6); assert.equal(bank.gurgle.duration, 4);
  for (const value of Object.values(bank)) for (const buffer of Array.isArray(value) ? value : [value]) {
    assert.ok(Array.from(buffer.getChannelData(0)).every(v => Number.isFinite(v)));
  }
  for (const buffer of [...bank.keys, ...bank.spaces, bank.mouse, ...bank.steps, bank.drop]) assert.ok(Array.from(buffer.getChannelData(0)).every(v => Math.abs(v) <= .901));
});
