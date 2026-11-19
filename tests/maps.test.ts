import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_BY_ID, SEATING } from '../src/shared/layout.js';
import { OFFICE_PLAN, seatOn, seatHereOn } from '../src/shared/maps/index.js';
import { clockWork, workedMs } from '../src/server/workers.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

test('the fixed office preserves all desks, kiosks, meeting chairs and expansion rows', () => {
  assert.equal(OFFICE_PLAN.id, 'office');
  assert.deepEqual([...OFFICE_PLAN.byId], [...DESK_BY_ID]);
});

test('office and rooftop seats stay valid only on their own floor', () => {
  for (const seat of SEATING.filter((s) => !s.roof && !s.lobby && !s.server)) {
    const key = `${seat.id}:0`;
    assert.ok(seatOn(OFFICE_PLAN, key));
    assert.ok(seatHereOn(OFFICE_PLAN, key, false));
    assert.equal(seatHereOn(OFFICE_PLAN, key, true), undefined);
  }
  for (const seat of SEATING.filter((s) => s.roof)) {
    assert.ok(seatHereOn(OFFICE_PLAN, `${seat.id}:0`, true));
    assert.equal(seatHereOn(OFFICE_PLAN, `${seat.id}:0`, false), undefined);
  }
  assert.equal(seatOn(OFFICE_PLAN, 'missing:0'), undefined);
  assert.equal(seatOn(OFFICE_PLAN, `${SEATING[0].id}:999`), undefined);
});

test('a worker keeps count of how long it has worked, over every stretch', () => {
  const info = { status: 'idle' } as WorkerInfo;
  clockWork(info, 'working', 1000);
  assert.equal(info.workingSince, 1000);
  // Still working: the stretch keeps going.
  clockWork(info, 'working', 5000);
  assert.equal(info.workingSince, 1000);
  assert.equal(workedMs(info, 7000), 6000);
  clockWork(info, 'done', 11_000);
  assert.equal(info.workedMs, 10_000);
  assert.equal(info.workingSince, undefined);
  clockWork(info, 'working', 20_000);
  clockWork(info, 'needs_input', 25_000);
  assert.equal(info.workedMs, 15_000);
  // Asleep, it doesn't count.
  clockWork(info, 'offline', 90_000);
  assert.equal(workedMs(info, 100_000), 15_000);
});
