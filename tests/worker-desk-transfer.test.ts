import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Arrivals } from '../src/client/features/workers/leaving.js';
import type { Worker } from '../src/client/world/character/worker.js';
import type { DeskView } from '../src/client/world/types.js';
import { DESKS, WING_DESKS, type DeskDef } from '../src/shared/layout.js';
import { officeNav, wayHome, wayToBalcony, type Pt } from '../src/shared/nav.js';

function seat(def: DeskDef, scene: THREE.Object3D): DeskView {
  const seatAnchor = new THREE.Group();
  seatAnchor.position.set(def.x, 0.4, def.z + 0.93);
  scene.add(seatAnchor);
  return { def, seatAnchor } as DeskView;
}

test('desk transfers walk, retarget without jumping, and settle at the latest seat on reconnect', () => {
  const scene = new THREE.Scene();
  const nav = officeNav(1);
  const [origin, first, last] = [DESKS[0], DESKS[3], WING_DESKS[0]].map(d => seat(d, scene));
  const model = { root: new THREE.Group(), walking: false, stopDancing() {} } as Worker;
  const moves = new Arrivals(scene, () => 0, () => {}, () => { throw Error('A desk transfer is not an elevator arrival'); });
  origin.seatAnchor.add(model.root);
  const position = () => model.root.getWorldPosition(new THREE.Vector3());
  const before = position();
  moves.transfer(model, origin, first, nav);
  assert.ok(position().distanceTo(before) < 1e-6);
  for (let i = 0; i < 12; i++) moves.update(1 / 30);
  assert.equal(model.walking, true);
  assert.ok(position().distanceTo(before) > 0.2);
  const inAisle = position();
  moves.transfer(model, first, last, nav);
  assert.ok(position().distanceTo(inAisle) < 1e-6);
  assert.equal(moves.positions().length, 1);
  for (let i = 0; i < 1600; i++) moves.update(1 / 30);
  assert.equal(model.root.parent, last.seatAnchor);
  assert.equal(model.root.position.length(), 0);
  assert.equal(model.walking, false);
  assert.equal(moves.positions().length, 0);
  moves.transfer(model, last, first, nav);
  moves.update(0.05);
  moves.clear();
  assert.equal(model.root.parent, first.seatAnchor);
  assert.equal(model.walking, false);
  assert.equal(moves.positions().length, 0);
});

test('removing a walking agent starts its exit route at its current position', () => {
  const here: Pt = [0, 0];
  for (const exit of [wayHome, wayToBalcony]) assert.deepEqual(exit(DESKS[0], 0, here)[0], here);
});
