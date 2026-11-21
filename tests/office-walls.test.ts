import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FLOOR, WINDOWS, WALL_T } from '../src/shared/layout.js';
import { buildWalls } from '../src/client/world/office/shell.js';

test('batched office walls keep both paint surfaces, shadow zones and window openings', () => {
  const group = new THREE.Group();
  const wall = new THREE.MeshToonMaterial();
  const opening = WINDOWS.find(w => w.wall === 'west')!;
  buildWalls(group, [], [opening], { wall, trim: new THREE.MeshToonMaterial(), planks: [] });
  group.updateMatrixWorld(true);
  const panels = group.children.filter(m => m.userData.wall) as THREE.Mesh[];
  assert.ok(panels.length > 0 && panels.length <= 16);
  const hit = (height: number, outside: boolean) => {
    const x = FLOOR.minX + (outside ? -WALL_T - 1 : 1);
    return new THREE.Raycaster(new THREE.Vector3(x, height, opening.u), new THREE.Vector3(outside ? 1 : -1, 0, 0), 0, 2)
      .intersectObjects(panels)[0]?.object as THREE.Mesh | undefined;
  };
  const sill = opening.y0 / 2;
  assert.equal(hit(sill, false)?.material, wall);
  assert.ok(hit(sill, true) && hit(sill, true)?.material !== wall);
  assert.equal(hit(sill, false)?.castShadow, true);
  assert.equal(hit(6, false)?.castShadow, false);
  assert.equal(hit((opening.y0 + opening.y1) / 2, false), undefined);
});
