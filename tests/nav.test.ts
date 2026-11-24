import test from 'node:test';
import assert from 'node:assert/strict';
import { BALCONY, BALCONY_DOOR, ELEVATOR, ELEVATOR_FRONT, EXIT_DOOR, EXIT_STAIRS, FLOOR, MEETING_ROOM, MEETING_SEATS, PARACHUTE, ROAD, SEATS, STATIONS, WING, deskBuilt, wingMinZ, type DeskDef } from '../src/shared/layout.js';
import { route, walkable, wayToLift, wayIn, type Pt } from '../src/shared/nav.js';

test('the former counter and appliance footprints are open on every office layout', () => {
  for (let wing = 0; wing <= WING.rows; wing++) {
    for (const x of [-16, -15, -14, -13, -11.3]) assert.ok(walkable(x, 12.2, wing), `blocked at ${x} on wing ${wing}`);
  }
});

/** Every place a worker can be on a floor built out `wing` rows, at each build-out there is. */
const everywhere = (): [DeskDef, number][] => Array.from({ length: WING.rows + 1 }, (_, wing) => [...SEATS, ...STATIONS, ...MEETING_SEATS].filter((d) => deskBuilt(d, wing)).map((d): [DeskDef, number] => [d, wing])).flat();

test('departing from every available seat on each wing reaches the elevator on walkable floor', () => {
  for (const [seat, wing] of everywhere()) {
    const way = wayToLift(seat, wing);
    assert.ok(Math.hypot(way[0][0] - seat.x, way[0][1] - seat.z) < 1.3, seat.id);
    assert.deepEqual(way.at(-1), [ELEVATOR.x, ELEVATOR_FRONT + 0.5]);
    for (let i = 2; i < way.length; i++) clear(way[i-1], way[i], seat.id, wing);
  }
});

function clear(a: Pt, b: Pt, what: string, wing = 0) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2);
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n;
    const z = a[1] + ((b[1] - a[1]) * k) / n;
    assert.ok(walkable(x, z, wing), `${what} walks into something at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
}

test('a worker called to a meeting walks from the elevator, in through the meeting room door, to beside its chair', () => {
  for (const seat of MEETING_SEATS) {
    const way = wayIn(seat);
    const [x0, z0] = way[0];
    assert.ok(Math.abs(x0 - ELEVATOR.x) < 0.6 && z0 > ELEVATOR_FRONT && z0 < ELEVATOR_FRONT + 1.2, `${seat.id} steps out of the elevator`);
    // It ends beside its chair, and gets there on open floor.
    const [ex, ez] = way[way.length - 1];
    assert.ok(Math.hypot(ex - seat.x, ez - seat.z) < 1.3, `${seat.id} ends beside its chair`);
    for (let i = 1; i < way.length - 1; i++) clear(way[i - 1], way[i], seat.id);
    // Into the room through its doorway, not the glass.
    const crossing = way.findIndex(([, z], i) => i > 0 && way[i - 1][1] < MEETING_ROOM.minZ && z >= MEETING_ROOM.minZ);
    assert.ok(crossing > 0, `${seat.id} goes into the room`);
    const [[ax, az], [bx, bz]] = [way[crossing - 1], way[crossing]];
    const x = ax + ((bx - ax) * (MEETING_ROOM.minZ - az)) / (bz - az);
    assert.ok(x > MEETING_ROOM.door.x0 && x < MEETING_ROOM.door.x1, `${seat.id} goes in by the door (x ${x.toFixed(2)})`);
  }
});

test('the back office is only floor once it is built out, and only as far as it goes', () => {
  const inside: Pt = [(WING.minX + WING.maxX) / 2 + 1.7, FLOOR.minZ - 1];
  assert.equal(walkable(inside[0], inside[1], 0), false, 'behind the north wall there is nothing');
  for (let wing = 1; wing <= WING.rows; wing++) {
    assert.ok(walkable(inside[0], inside[1], wing), `built out ${wing}, its first row is open floor`);
    assert.equal(walkable(inside[0], wingMinZ(wing) - 0.5, wing), false, `built out ${wing}, past its back wall is not`);
    // And there's a way from the room to the back of it.
    const back: Pt = [WING.minX + 0.6, wingMinZ(wing) + 0.6];
    const way = route([0, 0], back, wing);
    const [ex, ez] = way[way.length - 1];
    assert.ok(Math.hypot(ex - back[0], ez - back[1]) < 0.6, `built out ${wing}, the route gets to the back of it`);
  }
  // Nowhere else through the north wall.
  assert.equal(walkable(0, FLOOR.minZ - 1, WING.rows), false);
});
