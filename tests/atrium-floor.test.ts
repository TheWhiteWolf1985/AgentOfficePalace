import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { exteriorGroundGeometry } from '../src/client/world/city-ground.js';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function streetSurfaces() {
  const terrain = new THREE.Mesh(exteriorGroundGeometry({ minX: -672, maxX: 672, minZ: -672, maxZ: 672 }), material);
  terrain.name = 'city-terrain';
  const plaza = new THREE.Mesh(exteriorGroundGeometry({ minX: -22, maxX: 22, minZ: -23, maxZ: 21 }), material);
  plaza.name = 'city-plaza';
  plaza.position.y = 0.02;
  const group = new THREE.Group();
  group.add(terrain, plaza);
  group.updateMatrixWorld(true);
  return group;
}
const downAt = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));

test('city terrain and plaza leave the whole building footprint clear while preserving exterior paving', () => {
  const street = streetSurfaces();
  for (const [x, z] of [[0, 0], [-17.9, -12.9], [17.9, 12.9], [-7.8, 1.7], [7.8, 1.7], [0, -5]]) {
    assert.deepEqual(downAt(x, z).intersectObject(street, true), [], `${x},${z}: no exterior surface indoors`);
  }
  assert.equal(downAt(20, 0).intersectObject(street, true)[0]?.object.name, 'city-plaza');
  assert.equal(downAt(30, 0).intersectObject(street, true)[0]?.object.name, 'city-terrain');
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
