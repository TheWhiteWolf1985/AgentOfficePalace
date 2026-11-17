import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bindConferenceWhiteboard } from '../src/client/world/conference-whiteboard.js';
import { createWhiteboardSurface } from '../src/client/features/whiteboard/surface.js';
import { CONFERENCE_COLLIDERS } from '../src/shared/conference-room.js';
import { conferenceRoute } from '../src/shared/conference-room-nav.js';
import { blockerAt } from '../src/client/player/collide.js';

test('the real delivered face gets one unlit correctly oriented texture and a reachable front target', async () => {
  const data = readFileSync(new URL('../src/client/models/conference_room.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  const face = scene.getObjectByName('whiteboard_surface') as THREE.Mesh;
  const geometry = face.geometry, uv = Array.from(geometry.getAttribute('uv').array);
  const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  scene.traverse(n => { if (n instanceof THREE.Mesh) materials.set(n, n.material); });
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const bound = bindConferenceWhiteboard(scene, { material, fit: { width: 1968, height: 611 }, show: () => {} });
  assert.equal(face.geometry, geometry); assert.deepEqual(Array.from(geometry.getAttribute('uv').array), uv);
  assert.equal(texture.flipY, false); assert.equal(face.material, material); assert.equal(material.toneMapped, false);
  assert.equal(face.receiveShadow, false); assert.equal(face.userData.interact, bound.interactable);
  for (const [node, source] of materials) if (node !== face) assert.equal(node.material, source, node.name);
  assert.ok(Math.abs(bound.interactable.x + 5.4) < 0.001); assert.ok(Math.abs(bound.interactable.z + 10.58) < 0.001);
  const colliders = CONFERENCE_COLLIDERS.filter(c => c.role !== 'door_closed');
  assert.equal(blockerAt({ pos: new THREE.Vector3(), grounded: true, stepOffset: 0, colliders }, bound.interactable.x, bound.interactable.z, 0), null);
  assert.ok(conferenceRoute({ x: 8.5, z: -9.5 }, bound.interactable).length > 0);
});

test('the conference canvas is capped at 2048 pixels and fits drawings without stretching or allocating another texture', t => {
  const calls: number[][] = [];
  const context = new Proxy({ measureText: () => ({ width: 100 }), createLinearGradient: () => ({ addColorStop() {} }), drawImage: (_image: unknown, ...args: number[]) => calls.push(args) }, { get: (o, k) => k in o ? o[k as keyof typeof o] : () => {} });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  const display = createWhiteboardSurface(8, 2.7, 2048, true);
  const texture = display.material.map!, canvas = texture.image;
  assert.deepEqual([canvas.width, canvas.height], [2048, 691]);
  display.show({ width: 400, height: 200 } as HTMLCanvasElement); display.show(null);
  assert.equal(display.material.map, texture); assert.equal(calls.length, 1);
  const [x, y, width, height] = calls[0];
  assert.equal(width / height, 2); assert.equal(x, (2048 - width) / 2); assert.equal(y, (691 - height) / 2);
});
