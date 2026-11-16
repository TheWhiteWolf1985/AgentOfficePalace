import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyConferenceGlazing } from '../src/client/world/conference-glazing.js';

test('all delivered exterior windows show through, while frames and interior materials are preserved', async () => {
  const file = readFileSync(new URL('../src/client/models/conference_room.glb', import.meta.url));
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  const before = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    before.set(node, node.material);
    node.castShadow = true;
  });
  applyConferenceGlazing(scene);
  const sides = new Set<string>();
  let reflections = 0;
  for (const [node, original] of before) {
    const pane = /^window_(west|east|south)_\d/.exec(node.name);
    const reflection = /^window_reflection_/.test(node.name);
    if (pane || reflection) {
      const mat = node.material as THREE.MeshBasicMaterial;
      assert.ok(mat.isMeshBasicMaterial, node.name);
      assert.ok(mat.transparent && mat.opacity > 0 && mat.opacity < 0.3, `${node.name}: a faint tint, not an opaque panel`);
      assert.equal(mat.depthWrite, false, `${node.name}: does not hide the city behind it`);
      assert.equal(node.castShadow, false, `${node.name}: no solid shadow from the pane`);
      assert.equal(mat.side, THREE.FrontSide, `${node.name}: the exported box is not double blended`);
      if (pane) sides.add(pane[1]);
      else reflections++;
    } else {
      assert.equal(node.material, original, `${node.name}: preserve walls, furniture and partition glazing`);
      assert.equal(node.castShadow, true, `${node.name}: preserve opaque shadow casting`);
    }
  }
  assert.deepEqual([...sides].sort(), ['east', 'south', 'west']);
  assert.ok(reflections > 0);
});
