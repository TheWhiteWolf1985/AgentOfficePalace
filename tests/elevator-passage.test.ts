import assert from 'node:assert/strict';
import test from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { stepTo } from '../src/client/player/collide.js';
import { buildElevator } from '../src/client/world/elevator.js';
import { ELEVATOR, ELEVATOR_FRONT, SLAB, STREET_Y, streetBelow } from '../src/shared/layout.js';

test('an open office lift has a level, walkable threshold above a closed lower stop', () => {
  const office = buildElevator();
  const lower = buildElevator(-SLAB - STREET_Y);
  for (const index of [0, 1, 4]) {
    lower.setFloor(streetBelow(index));
    const colliders = [...office.colliders, ...lower.colliders];
    const start = ELEVATOR_FRONT - 1;
    const end = ELEVATOR_FRONT + 1;
    const body = { pos: new Vector3(ELEVATOR.x, 0, start), colliders, grounded: true, stepOffset: 0 };
    const walk = (direction: number) => {
      for (let i = 0; i < 40; i++) stepTo(body, body.pos.x, body.pos.z + direction * 0.05);
    };
    office.setOpen(false);
    office.update(1);
    walk(1);
    assert.ok(body.pos.z < ELEVATOR_FRONT);
    body.pos.z = start;
    office.setOpen(true);
    office.update(1);
    walk(1);
    assert.ok(Math.abs(body.pos.z - end) < 1e-6);
    walk(-1);
    assert.ok(Math.abs(body.pos.z - start) < 1e-6);
    assert.equal(body.pos.y, 0);
  }
  office.group.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(ELEVATOR.x, 0.12, ELEVATOR_FRONT + 0.5), new Vector3(0, 0, -1), 0, 1);
  assert.equal(ray.intersectObject(office.group, true).length, 0, 'no kick plate across the open door');
});
