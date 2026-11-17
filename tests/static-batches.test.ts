import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { batchStaticMeshes } from '../src/client/world/static-batches.js';
import { ATRIUM_DATA } from '../src/shared/atrium.js';
import { CONFERENCE_DATA } from '../src/shared/conference-room.js';

function metrics(root: THREE.Object3D) {
  let meshes = 0, triangles = 0;
  root.traverse(node => { if (node instanceof THREE.Mesh) { meshes++; triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3; } });
  return { meshes, triangles, bounds: new THREE.Box3().setFromObject(root, true) };
}

test('batching preserves transformed positions, normals, UVs and source geometry without changing dynamic meshes', () => {
  const root = new THREE.Group(), material = new THREE.MeshToonMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const nodes = [0, 1, 2].map(i => { const m = new THREE.Mesh(geometry, material); m.position.set(i + 0.123, .3, .7); m.rotation.y = i * .2; m.scale.set(1, 1.2, .8); root.add(m); return m; });
  const door = new THREE.Group(); door.name = 'door_pivot'; const leaf = new THREE.Mesh(geometry, material); door.add(leaf); root.add(door);
  const glass = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: .3 })); root.add(glass);
  const snapshot = () => {
    root.updateMatrixWorld(true); const vertices: number[][] = [];
    root.traverse(n => { if (!(n instanceof THREE.Mesh) || n === glass || n === leaf) return;
      const p = n.geometry.getAttribute('position'), uv = n.geometry.getAttribute('uv'), normal = n.geometry.getAttribute('normal');
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(n.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld), no = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
        vertices.push([v.x, v.y, v.z, no.x, no.y, no.z, uv.getX(i), uv.getY(i)]);
      }
    }); return vertices;
  };
  const before = snapshot(), source = Array.from(geometry.getAttribute('position').array);
  const result = batchStaticMeshes(root); assert.equal(result.meshesSaved, 2);
  const after = snapshot(); assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) for (let c = 0; c < before[i].length; c++) assert.ok(Math.abs(before[i][c] - after[i][c]) < 1e-5);
  assert.deepEqual(Array.from(geometry.getAttribute('position').array), source);
  assert.equal(leaf.parent, door); assert.equal(glass.parent, root);
  door.rotation.y = Math.PI / 2; assert.equal(leaf.parent, door);
  assert.ok(nodes.every(node => !node.parent));
});

test('real room assets lose static draw objects while preserving bounds, triangles, rugs and occlusion distances', async () => {
  for (const name of ['atrium', 'conference_room']) {
    const file = readFileSync(new URL(`../src/client/models/${name}.glb`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
    const before = metrics(scene);
    const rays = [[0.3, 9], [0, -5], [-7.8, 1.7], [7.8, 1.7], [0, 0], [10, 5]].map(([x,z]) => new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0,-1,0)));
    scene.updateMatrixWorld(true); const hits = rays.map(ray => ray.intersectObject(scene, true).map(hit => hit.distance));
    const protectedNames = new Set(name === 'atrium' ? [ATRIUM_DATA.logo.surface] : [CONFERENCE_DATA.whiteboard.surface_node, CONFERENCE_DATA.door.door_pivot, ...CONFERENCE_DATA.seats.map(seat => seat.chair)]);
    const kept = new Map([...protectedNames].map(n => [n, scene.getObjectByName(n)]));
    const result = batchStaticMeshes(scene, protectedNames); scene.updateMatrixWorld(true);
    const after = metrics(scene);
    assert.ok(result.meshesSaved > 50, `${name}: saves ${result.meshesSaved}`);
    assert.equal(after.triangles, before.triangles);
    assert.ok(after.bounds.min.distanceTo(before.bounds.min) < 1e-4); assert.ok(after.bounds.max.distanceTo(before.bounds.max) < 1e-4);
    for (const [n, node] of kept) assert.equal(scene.getObjectByName(n), node);
    rays.forEach((ray,i) => { const after = ray.intersectObject(scene,true).map(hit => hit.distance); assert.equal(after.length,hits[i].length); after.forEach((d,j) => assert.ok(Math.abs(d-hits[i][j]) < 1e-4)); });
    console.log(`${name}: ${before.meshes} -> ${after.meshes} mesh objects, ${result.batches} static batches`);
  }
});
