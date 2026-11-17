import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCompanyGround } from '../src/client/world/outside.js';

function streetSurfaces() {
  const { group } = buildCompanyGround();
  group.updateMatrixWorld(true);
  return group;
}
const downAt = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));

test('the runtime company lot leaves the whole building footprint clear while preserving exterior paving', () => {
  const street = streetSurfaces();
  for (const [x, z] of [[0, 0], [-17.9, -12.9], [17.9, 12.9], [-7.8, 1.7], [7.8, 1.7], [0, -5]]) {
    assert.deepEqual(downAt(x, z).intersectObject(street, true), [], `${x},${z}: no exterior surface indoors`);
  }
  assert.equal(downAt(-19, -8).intersectObject(street, true)[0]?.object.parent?.name, 'company-paving');
  assert.equal(downAt(30, 0).intersectObject(street, true)[0]?.object.parent?.name, 'company-paving');
});

test('the real GLB parquet and all three rugs remain the first visible surfaces through the runtime street', async () => {
  const file = readFileSync(new URL('../src/client/models/atrium.glb', import.meta.url));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  scene.add(streetSurfaces());
  scene.updateMatrixWorld(true);
  for (const [x, z, name] of [
    [0.3, 9, 'atrio_floor_boards_main'],
    [0, -5, 'atrio_reception_rug'],
    [-7.8, 1.7, 'atrio_waiting_rug_left'],
    [7.8, 1.7, 'atrio_waiting_rug_right'],
  ] as const) {
    const first = downAt(x, z).intersectObject(scene, true)[0]?.object;
    let node = first;
    while (node && node.name !== name) node = node.parent ?? undefined;
    assert.ok(node, `${name} remains visible; first hit was ${first?.name}`);
  }
});
