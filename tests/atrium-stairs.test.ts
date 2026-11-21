import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { UPPER_GATE, LOBBY_GATE, stairArrival, crossedStairs } from '../src/shared/atrium-stairs.js';
import { LOBBY, SERVER_ROOM, ROOF } from '../src/shared/rooftop.js';
import { SERVER_ROOM_COLLIDERS } from '../src/shared/server-room.js';
import { blockerAt, groundAt } from '../src/client/player/collide.js';
import { floorHandlers } from '../src/server/ws/handlers/floors.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';

test('stairs select the first open office or the server room and return to the top landing', () => {
  const calls: unknown[][] = [];
  const floors = new Map<string, { id: string }>();
  const ctx = { floors,
    goToFloor: (_: Client, f: { id: string }, at: unknown) => calls.push([f.id, at]),
    goToServerRoom: (_: Client, at: unknown) => calls.push([SERVER_ROOM, at]),
    toLobby: (_: Client, at: unknown) => calls.push([LOBBY, at]),
    sendTo: (_: Client, msg: unknown) => calls.push([msg]),
  } as unknown as Ctx;
  const go = (from: string, floor: string) => {
    floorHandlers['floor.go'](ctx, { peer: { floor: from } } as Client, { t: 'floor.go', via: 'stairs', floor });
    return calls.pop();
  };
  const denied = [{ t: 'floor.stairs.unavailable' }];
  assert.deepEqual(go(LOBBY, SERVER_ROOM), [SERVER_ROOM, stairArrival(SERVER_ROOM)]);
  assert.deepEqual(go(SERVER_ROOM, LOBBY), [LOBBY, stairArrival(LOBBY)]);
  floors.set('z-first', { id: 'z-first' });
  floors.set('a-second', { id: 'a-second' });
  assert.deepEqual(go(LOBBY, 'z-first'), ['z-first', stairArrival('z-first')]);
  assert.deepEqual(go('z-first', LOBBY), [LOBBY, stairArrival(LOBBY)]);
  for (const floor of [SERVER_ROOM, 'a-second', ROOF]) assert.deepEqual(go(floor, LOBBY), denied);
  assert.deepEqual(go(LOBBY, SERVER_ROOM), denied);
  floors.delete('z-first');
  assert.deepEqual(go(LOBBY, 'a-second'), ['a-second', stairArrival('a-second')]);
});

test('thresholds require a crossing in the right direction, within the doorway and at floor height', () => {
  for (const lobby of [false, true]) {
    const gate = lobby ? LOBBY_GATE : UPPER_GATE;
    const direction = lobby ? 1 : -1;
    const start = { ...gate, z: gate.z - direction * .08 };
    const end = { ...gate, z: gate.z + direction * .08 };
    assert.ok(crossedStairs(lobby, start, end));
    assert.equal(crossedStairs(lobby, end, start), false);
    assert.equal(crossedStairs(lobby, start, start), false);
    assert.equal(crossedStairs(lobby, { ...start, y: -1 }, end), false);
    assert.equal(crossedStairs(lobby, { ...start, z: start.z - 5 * direction }, end), false);
    assert.equal(crossedStairs(lobby, { ...start, x: 0 }, { ...end, x: 0 }), false);
  }
});

test('the path between the server room landing and doorway clears the delivered furniture', () => {
  const body = { pos: new Vector3(), grounded: true, stepOffset: 0, colliders: SERVER_ROOM_COLLIDERS };
  const end = stairArrival(SERVER_ROOM);
  for (let z = UPPER_GATE.z - .2; z <= end.z + .5; z += .1) {
    assert.equal(blockerAt(body, end.x, z, 0), null);
    assert.equal(groundAt(body.colliders, end.x, z, 0), 0);
  }
});
