import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { batchExteriorGlazing } from '../src/client/world/exterior-glazing.js';
import { selectExterior } from '../src/client/world/exterior-models.js';
import { applyConferenceGlazing } from '../src/client/world/conference-glazing.js';

test('delivered exterior glazing reduces forty room panes/reflections to six facade draws with the same surfaces and materials', async () => {
  for (const name of ['conference_room', 'atrium'] as const) {
    const bytes = readFileSync(new URL(`../src/client/models/${name}.glb`, import.meta.url));
    const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    const root = selectExterior(source, name);
    if (name === 'conference_room') applyConferenceGlazing(root);
    const panes: THREE.Mesh[] = [];
    root.traverse(n => { if (n instanceof THREE.Mesh && !Array.isArray(n.material) && n.material.transparent) panes.push(n); });
    // Future deliveries can also carry UVs: retain them through the facade merge.
    for (const pane of panes) {
      pane.geometry = pane.geometry.clone();
      pane.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pane.geometry.getAttribute('position').count * 2).fill(.25), 2));
    }
    const snapshot = () => {
      root.updateMatrixWorld(true); const vertices: string[] = [];
      root.traverse(n => {
        if (!(n instanceof THREE.Mesh) || Array.isArray(n.material) || !n.material.transparent) return;
        const g = n.geometry, p = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.getAttribute('uv');
        const nm = new THREE.Matrix3().getNormalMatrix(n.matrixWorld);
        for (let j = 0; j < (g.index?.count ?? p.count); j++) {
          const i = g.index ? g.index.getX(j) : j;
          const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(n.matrixWorld), no = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(nm);
          vertices.push(n.material.uuid + ':' + [...v.toArray(), ...no.toArray(), uv.getX(i), uv.getY(i)].map(x => x.toFixed(4)).join(','));
        }
      }); return vertices.sort();
    };
    const before = snapshot(), sourceBuffers = panes.map(p => Array.from(p.geometry.getAttribute('position').array));
    const result = batchExteriorGlazing(root);
    assert.equal(result.sourceMeshes, name === 'conference_room' ? 40 : 18);
    assert.equal(result.batches, name === 'conference_room' ? 6 : 3);
    assert.deepEqual(snapshot(), before);
    panes.forEach((p, i) => assert.deepEqual(Array.from(p.geometry.getAttribute('position').array), sourceBuffers[i]));
    root.traverse(n => {
      if (!(n instanceof THREE.Mesh) || !n.userData.exteriorGlazingSources) return;
      assert.ok(panes.some(p => p.material === n.material));
      assert.equal((n.material as THREE.Material).depthWrite, false);
      assert.equal(n.renderOrder, 0);
    });
    assert.ok(source.getObjectByName(name === 'atrium' ? 'atrio_window_east_0_glass' : 'window_south_0'));
    console.log(name, result);
  }
});

test('overlap, other depth planes, material state, layers and animated callbacks stay independently sortable', () => {
  const root = new THREE.Group(), glass = new THREE.MeshBasicMaterial({ transparent: true, opacity: .2, depthWrite: false }); glass.name = 'mat_glass_blue';
  const add = (x: number, z = 0, material = glass) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, .04), material); m.position.set(x, 0, z); root.add(m); return m; };
  const a = add(0), b = add(3), overlap = add(.5);
  const depth = add(6, .4), material = glass.clone(); material.depthWrite = true;
  const depthWriter = add(9, 0, material), layer = add(12); layer.layers.set(2);
  const dynamic = add(15); dynamic.onBeforeRender = () => {};
  assert.equal(batchExteriorGlazing(root).meshesSaved, 0);
  for (const n of [a, b, overlap, depth, depthWriter, layer, dynamic]) assert.equal(n.parent, root);
  overlap.removeFromParent();
  assert.equal(batchExteriorGlazing(root).meshesSaved, 1);
  for (const n of [depth, depthWriter, layer, dynamic]) assert.equal(n.parent, root);
});
