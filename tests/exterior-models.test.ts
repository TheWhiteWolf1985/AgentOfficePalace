import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { selectExterior, createExteriorCache } from '../src/client/world/exterior-models.js';
import { applyConferenceGlazing } from '../src/client/world/conference-glazing.js';
import { buildTower } from '../src/client/world/tower.js';
import { SLAB, STOREY, WALL_HEIGHT } from '../src/shared/layout.js';
import type { NightParts } from '../src/client/world/outside.js';
import type { Collider } from '../src/client/world/types.js';

async function asset(name: string) {
  const file = readFileSync(new URL(`../src/client/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')).scene;
}
function metrics(root: THREE.Object3D) {
  let meshes = 0, triangles = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse(n => { if (n instanceof THREE.Mesh) { meshes++; triangles += (n.geometry.index?.count ?? n.geometry.getAttribute('position').count) / 3; geometries.add(n.geometry); } });
  let bytes = 0;
  for (const g of geometries) {
    for (const attr of Object.values(g.attributes)) bytes += attr.array.byteLength;
    bytes += g.index?.array.byteLength ?? 0;
  }
  return { meshes, triangles, geometryBytes: bytes };
}

test('real exterior shells remove interior furniture while preserving all selected transforms, UVs and source geometry', async () => {
  for (const name of ['atrium', 'conference_room'] as const) {
    const source = await asset(name), before = metrics(source), shell = selectExterior(source, name);
    source.updateMatrixWorld(true); shell.updateMatrixWorld(true);
    const after = metrics(shell);
    assert.ok(after.meshes < before.meshes * .6, `${name}: ${JSON.stringify({before,after})}`);
    assert.ok(after.triangles < before.triangles * .7);
    assert.ok(after.geometryBytes < before.geometryBytes * .7);
    shell.traverse(n => {
      if (!(n instanceof THREE.Mesh)) return;
      const original = source.getObjectByName(n.name) as THREE.Mesh;
      assert.ok(original); assert.equal(n.geometry, original.geometry); assert.equal(n.material, original.material);
      assert.deepEqual(n.matrixWorld.elements, original.matrixWorld.elements);
      assert.equal(n.geometry.getAttribute('uv'), original.geometry.getAttribute('uv'));
    });
    for (const removed of ['furniture', 'atrio_furniture', 'anchors', 'atrio_anchors', 'atrio_stairs', 'whiteboard_surface']) assert.equal(shell.getObjectByName(removed), undefined);
    for (const kept of name === 'atrium' ? ['atrio_company_logo_surface','atrio_logo_backing','atrio_floor_main','atrio_ceiling_slab_0','atrio_window_east_0_glass'] : ['floor_main','ceiling_main','window_south_0']) assert.ok(shell.getObjectByName(kept), kept);
    assert.deepEqual(metrics(source), before, 'deriving a shell leaves the walkable source untouched');
    console.log(name, JSON.stringify({before,after}));
  }
});

test('derived templates are prepared once and share geometry/materials across copies; absent models remain retryable', async () => {
  let source: THREE.Object3D | null = null, loads = 0, paints = 0;
  const cached = createExteriorCache(() => { loads++; return source; }, (_name, root) => { paints++; applyConferenceGlazing(root); });
  assert.equal(cached('conference_room'), null);
  source = await asset('conference_room');
  // The current pane has no UVs; a future textured delivery must retain them too.
  const sourcePane = source.getObjectByName('window_south_0') as THREE.Mesh;
  sourcePane.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(sourcePane.geometry.getAttribute('position').count * 2), 2));
  const before = metrics(source), first = cached('conference_room')!, next = cached('conference_room')!;
  assert.equal(loads, 2); assert.equal(paints, 1); assert.notEqual(first, next);
  const meshes: THREE.Mesh[] = []; first.traverse(n => { if (n instanceof THREE.Mesh) meshes.push(n); });
  const others: THREE.Mesh[] = []; next.traverse(n => { if (n instanceof THREE.Mesh) others.push(n); });
  meshes.forEach((n,i) => { assert.equal(n.geometry, others[i].geometry); assert.equal(n.material, others[i].material); assert.equal(n.userData.sharedImportedGeometry, true); });
  const pane = first.getObjectByName('window_south_0') as THREE.Mesh;
  assert.ok((pane.material as THREE.Material).transparent); assert.equal((pane.material as THREE.Material).depthWrite, false);
  assert.ok(pane.geometry.getAttribute('uv'));
  first.position.y = 200; assert.equal(next.position.y, 0);
  assert.deepEqual(metrics(source), before);
});

test('tower floor/wing rebuilds retain cached shell buffers and glazing without a second batch or disposal', async () => {
  const source = await asset('conference_room');
  const cached = createExteriorCache(() => source, (_name, root) => applyConferenceGlazing(root));
  const template = cached('conference_room')!;
  const geos = new Set<THREE.BufferGeometry>(); let disposed = 0;
  template.traverse(n => { if (n instanceof THREE.Mesh) geos.add(n.geometry); });
  for (const g of geos) g.addEventListener('dispose', () => disposed++);
  const night = { windows: [] } as unknown as NightParts, colliders: Collider[] = [];
  const tower = buildTower(colliders, night, cached);
  for (const [index,count,wings] of [[-1,0,[]],[-1,3,[1,2,0]],[0,3,[1,2,0]],[1,3,[1,2,0]],[3,3,[1,2,0]],[0,1,[0]],[-1,3,[1,2,0]]] as const) {
    tower.set(index,count,wings);
    const room = tower.group.getObjectByName('exterior-conference_room');
    if (index < count) {
      assert.ok(room); assert.equal(room.position.y, (count - 1 - index) * STOREY + WALL_HEIGHT + SLAB);
      room.traverse(n => { if (n instanceof THREE.Mesh) assert.ok(geos.has(n.geometry), 'only cached shell geometry, never re-merged'); });
      let pane: THREE.Mesh | undefined;
      room.traverse(n => { if (n instanceof THREE.Mesh && (n.name === 'window_south_0' || n.userData.exteriorGlazingSources?.includes('window_south_0'))) pane = n; });
      assert.ok(pane);
      assert.deepEqual(Object.keys(pane.geometry.attributes), Object.keys((source.getObjectByName('window_south_0') as THREE.Mesh).geometry.attributes));
    } else assert.equal(room, undefined);
    assert.equal(disposed, 0); assert.equal(night.windows.length, 3);
    assert.ok(colliders.length < 30, 'rebuild replaces owned colliders');
  }
});
