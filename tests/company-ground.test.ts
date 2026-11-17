import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3, type Mesh, type MeshToonMaterial } from 'three';
import { BUILDING, CAMPUS_TREES, GROUNDS, onGrounds, PAVEMENT, ROAD_INNER } from '../src/shared/ground.js';
import { BALCONY, EXIT_STAIRS, WING, wingMinZ } from '../src/shared/layout.js';
import { wayHome } from '../src/shared/nav.js';
import { DESKS } from '../src/shared/layout.js';
import { arrivalSpot, spotFrom } from '../src/server/office/input.js';
import { buildCompanyGround } from '../src/client/world/outside.js';
import { blockerAt, groundAt, stepTo } from '../src/client/player/collide.js';

const inside = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

test('the perimeter road clears the full building, balcony, stairs and every supported back-office row', () => {
  for (const [x, z] of [[BUILDING.minX, BUILDING.minZ], [BUILDING.maxX, BUILDING.maxZ], [WING.maxX + 0.3, wingMinZ(WING.rows) - 0.3], [BALCONY.minX, BALCONY.maxZ], [EXIT_STAIRS.minX, EXIT_STAIRS.landingZ1 + EXIT_STAIRS.steps * EXIT_STAIRS.run]]) {
    assert.ok(inside(ROAD_INNER, x, z), `${x},${z} stays inside the road`);
    assert.ok(onGrounds(x, z));
  }
  assert.equal(CAMPUS_TREES.length, 4);
  for (const { x, z } of CAMPUS_TREES) {
    assert.ok(inside(ROAD_INNER, x, z));
    assert.ok(!inside(BUILDING, x, z));
    assert.ok(!PAVEMENT.some(b => inside(b, x, z)), 'tree trunk does not block the paved routes');
    assert.ok(x < WING.minX || x > WING.maxX + 0.3 || z > BUILDING.minZ || z < wingMinZ(WING.rows) - 0.3);
  }
});

test('all four sides and corners of the real road render asphalt, with matching paved footsteps', () => {
  const { group, colliders } = buildCompanyGround();
  group.updateMatrixWorld(true);
  for (const [x, z] of [[0, 26], [0, -30], [-32, 0], [32, 0], [-32, 26], [32, 26], [-32, -30], [32, -30]]) {
    const hit = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0)).intersectObject(group, true)[0];
    assert.ok(hit, `${x},${z} has a visible surface`);
    const color = ((hit.object as Mesh).material as MeshToonMaterial).color.getHexString();
    assert.ok(['717983', 'f4edda'].includes(color), `${x},${z} is asphalt or its road markings, got ${color}`);
    assert.ok(PAVEMENT.some(b => inside(b, x, z)));
    assert.equal(groundAt(colliders, x, z, 0), 0);
  }
});

test('the small pedestrian perimeter is solid on all four sides without blocking the exit route', () => {
  const { colliders } = buildCompanyGround();
  for (const [x, z, tx, tz] of [[GROUNDS.minX + 1, 0, GROUNDS.minX - 0.1, 0], [GROUNDS.maxX - 1, 0, GROUNDS.maxX + 0.1, 0], [0, GROUNDS.minZ + 1, 0, GROUNDS.minZ - 0.1], [0, GROUNDS.maxZ - 1, 0, GROUNDS.maxZ + 0.1]]) {
    const body = { pos: new Vector3(x, 0, z), colliders, grounded: true, stepOffset: 0 };
    stepTo(body, tx, tz);
    assert.ok(onGrounds(body.pos.x, body.pos.z), 'cannot leave the company lot');
  }
  const body = { pos: new Vector3(0, 0, 0), colliders, grounded: true, stepOffset: 0 };
  for (const [x, z] of wayHome(DESKS[0]).slice(-3)) {
    assert.ok(onGrounds(x, z));
    assert.equal(blockerAt(body, x, z, 0), null, `${x},${z} exit stays clear`);
  }
});

test('server arrivals and saved reconnect coordinates outside the old city return to the normal arrival path', () => {
  for (const [x, z] of [[50, 0], [-100, 50], [0, -60], [GROUNDS.minX, 0], [0, GROUNDS.maxZ]]) {
    assert.equal(arrivalSpot({ x, y: -7.1, z, rotY: 1 }), undefined);
    assert.equal(spotFrom(new URLSearchParams({ x: String(x), y: '-7.1', z: String(z), rotY: '1' })), undefined);
  }
  assert.deepEqual(arrivalSpot({ x: -38, y: -7.1, z: 21.3, rotY: 1 }), { x: -38, y: -7.1, z: 21.3, rotY: 1 });
  assert.ok(!onGrounds(Infinity, 0) && !onGrounds(0, NaN));
});
