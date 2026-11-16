import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ATRIUM_DATA, ATRIUM_SEATING, ATRIUM_COLLIDERS } from '../src/shared/atrium.js';
import { LOBBY, ROOF } from '../src/shared/rooftop.js';
import { roofDrop, seatHere, STOREY, streetBelow } from '../src/shared/layout.js';
import { atriumRoute } from '../src/shared/atrium-nav.js';
import { blockerAt, groundAt } from '../src/client/player/collide.js';
import { openModel } from './glb.js';

test('the atrium imports the original GLB and all ten lounge anchors without another axis rotation', () => {
  const bytes = readFileSync(new URL('../src/client/models/atrium.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ATRIUM_DATA.sourceSha256);
  const glb = openModel('atrium');
  assert.equal(ATRIUM_SEATING.length, 10);
  assert.ok(glb.byName(ATRIUM_DATA.logo.surface) >= 0);
  for (const seat of ATRIUM_DATA.seats) {
    const at = glb.placed(glb.byName(seat.id)).at;
    assert.ok(at.distanceTo(new Vector3(seat.position.x, seat.position.y, seat.position.z)) < 0.0001, seat.id);
    assert.ok(seat.facing.x * (seat.stand.x-seat.position.x) + seat.facing.z * (seat.stand.z-seat.position.z) > 1, 'seated person faces the aisle');
    assert.deepEqual(seatHere(`${seat.id}:0`, LOBBY)?.stand, seat.stand);
    assert.equal(seatHere(`${seat.id}:0`, ROOF), undefined);
    assert.equal(seatHere(`${seat.id}:0`, false), undefined);
  }
  assert.equal(seatHere('seat_001:0', LOBBY), undefined);
  assert.equal(seatHere('couch:0', LOBBY), undefined);
});

test('the ground floor is fixed below offices and the meeting room stays above them, including zero offices', () => {
  assert.equal(streetBelow(-1), 0);
  assert.equal(streetBelow(0), -STOREY);
  for (const offices of [0, 1, 2, 5]) assert.ok(Math.abs(roofDrop(offices) - (offices + 1) * STOREY) < 1e-9);
});

test('all lounge stand points are clear and reachable from the elevator using atrium furniture', () => {
  const body = { pos: new Vector3(8.5, 0, -10), grounded: true, stepOffset: 0, colliders: ATRIUM_COLLIDERS };
  for (const seat of ATRIUM_DATA.seats) {
    assert.equal(blockerAt(body, seat.stand.x, seat.stand.z, 0), null, seat.id);
    assert.equal(groundAt(ATRIUM_COLLIDERS, seat.stand.x, seat.stand.z, 0), 0, seat.id);
    const end = atriumRoute(body.pos, seat.stand).at(-1);
    assert.ok(end && Math.hypot(end.x-seat.stand.x, end.z-seat.stand.z) < 0.6, seat.id);
  }
  assert.ok(blockerAt(body, -18, 0, 0), 'outside wall is solid');
  assert.ok(blockerAt(body, 0, -8, 0), 'reception counter is solid');
  assert.equal(blockerAt(body, 0, 10, 0), null, 'central entrance aisle stays clear');
});
