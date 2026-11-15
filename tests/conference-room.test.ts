import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CONFERENCE_COLLIDERS, CONFERENCE_DATA, CONFERENCE_SEATING } from '../src/shared/conference-room.js';
import { seatHere } from '../src/shared/layout.js';
import { blockerAt, ceilingAt, groundAt } from '../src/client/player/collide.js';
import { openModel } from './glb.js';
import { conferenceRoute } from '../src/shared/conference-room-nav.js';

test('the delivered model, anchors and application coordinates agree', () => {
  const file = readFileSync(new URL('../src/client/models/conference_room.glb', import.meta.url));
  assert.equal(createHash('sha256').update(file).digest('hex'), CONFERENCE_DATA.sourceSha256);
  const glb = openModel('conference_room');
  for (const seat of CONFERENCE_DATA.seats) {
    assert.ok(glb.byName(seat.id) >= 0, seat.id);
    const pos = glb.placed(glb.byName(seat.id)).at;
    assert.ok(pos.distanceTo(new Vector3(seat.position.x, seat.position.y, seat.position.z)) < 0.0001, `${seat.id}: no second axis conversion`);
    const place = seatHere(`${seat.id}:0`, true)!;
    assert.equal(place.hips, seat.position.y);
    assert.deepEqual(place.stand, seat.stand);
    assert.equal(seatHere(`${seat.id}:0`, false), undefined);
  }
  assert.equal(CONFERENCE_SEATING.length, 19);
  assert.equal(CONFERENCE_DATA.seats.filter((s) => s.role !== 'lounge').length, 13);
  assert.ok(glb.byName(CONFERENCE_DATA.whiteboard.surface_node) >= 0);
  assert.ok(glb.byName(CONFERENCE_DATA.door.door_pivot) >= 0);
});

test('a walking avatar can reach every stand anchor from the elevator through the open door', () => {
  const colliders = CONFERENCE_COLLIDERS.filter((c) => c.role !== 'door_closed');
  const body = { pos: new Vector3(8.5, 0, -10), grounded: true, stepOffset: 0, colliders };
  const free = (x: number, z: number) => !blockerAt(body, x, z, 0);
  const cell = 0.2;
  const key = (x: number, z: number) => `${x},${z}`;
  const queue: [number, number][] = [[42, -50]];
  const seen = new Set([key(42, -50)]);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (Math.abs(nx * cell) >= 18 || Math.abs(nz * cell) >= 13 || seen.has(k) || !free(nx * cell, nz * cell)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  for (const seat of CONFERENCE_DATA.seats) {
    assert.ok(free(seat.stand.x, seat.stand.z), `${seat.id}: room to get up`);
    assert.ok(seen.has(key(Math.round(seat.stand.x / cell), Math.round(seat.stand.z / cell))), `${seat.id}: reachable aisle`);
    assert.ok(Math.abs(groundAt(colliders, seat.stand.x, seat.stand.z, 0)) < 0.001, `${seat.id}: feet on floor`);
    assert.ok(ceilingAt(colliders, seat.stand.x, seat.stand.z, 0) >= 5.19, `${seat.id}: headroom`);
  }
  assert.ok(blockerAt({ ...body, colliders: CONFERENCE_COLLIDERS }, 3.6, 0, 0), 'closed glass door blocks passage');
  assert.ok(free(3.6, 0), 'open doorway clears the avatar');
  assert.ok(blockerAt(body, -5.4, 0, 0), 'the table remains solid');
  assert.ok(blockerAt(body, -18, 0, 0), 'the outside wall remains solid');
});

test('walking to a teammate uses the shared room furniture instead of the project office layout', () => {
  for (const seat of CONFERENCE_DATA.seats) {
    const path = conferenceRoute({ x: 8.5, z: -9.5 }, seat.stand);
    const end = path.at(-1);
    assert.ok(end && Math.hypot(end.x - seat.stand.x, end.z - seat.stand.z) < 0.6, `${seat.id}: route reaches the stand anchor`);
  }
});
