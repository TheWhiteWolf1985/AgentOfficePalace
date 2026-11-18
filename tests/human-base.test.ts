import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { humanBase } from '../src/client/world/character/human-base.js';
import { Person } from '../src/client/world/character/person.js';
import { AVATAR_COLOR_ROLES, DEFAULT_AVATAR_COLORS } from '../src/shared/avatar-colors.js';
import { FirstPersonBody } from '../src/client/world/character/person-first.js';

const bytes = readFileSync(new URL('../src/client/models/human_base.glb', import.meta.url));
const load = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function materials(root: THREE.Object3D) {
  const result = new Map<string, THREE.MeshToonMaterial>();
  root.traverse(n => {
    if (n instanceof THREE.Mesh) for (const m of (Array.isArray(n.material) ? n.material : [n.material])) result.set(m.name, m);
  });
  return result;
}
function canvas(t: TestContext) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 20 }) }, { get: (o, k) => k in o ? o[k as keyof typeof o] : () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  t.after(() => { if (before) Object.defineProperty(globalThis, 'document', before); else delete (globalThis as any).document; });
}

test('runtime user GLB is the delivered unit-scale model with an independently posed rigid rig', async () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '9b5f80f5ce9afef51b70b4cebbd6f5d867b43fdec46fc7f23063b2e51c09607b');
  const source = await load(), original = source.scene.getObjectByName('char_root')!;
  const before = new THREE.Box3().setFromObject(original), a = humanBase(source.scene.clone(true)), b = humanBase(source.scene.clone(true));
  assert.equal(source.animations.length, 0);
  assert.deepEqual(a.rig.root.scale.toArray(), [1, 1, 1]);
  assert.ok(Math.abs(before.max.y - 1.7655) < 0.00001);
  assert.ok(new THREE.Box3().setFromObject(a.rig.root).equals(before));
  assert.ok(a.rig.root instanceof THREE.Group && a.rig.body instanceof THREE.Group && a.rig.head instanceof THREE.Group);
  assert.equal(a.rig.body.parent, a.rig.root);
  for (const part of [a.rig.head, a.rig.torso, a.rig.armL, a.rig.armR, a.rig.legL, a.rig.legR]) assert.equal(part.parent, a.rig.body);
  a.rig.armL.rotation.x = -1;
  assert.ok(b.rig.armL.rotation.x === 0);
  assert.ok(original.getObjectByName('char_arm_negx')!.rotation.x === 0);
  a.dispose(); b.dispose();
});

test('base colors and face primitives survive toon conversion without sharing instance materials', async () => {
  const source = (await load()).scene, a = humanBase(source.clone(true)), b = humanBase(source.clone(true));
  const original = materials(source), first = materials(a.rig.root), second = materials(b.rig.root);
  assert.equal(first.size, 12);
  for (const [name, mat] of first) {
    assert.ok(mat instanceof THREE.MeshToonMaterial);
    assert.ok(mat.color.equals(original.get(name)!.color), name);
    assert.notEqual(mat, second.get(name));
    assert.notEqual(mat, original.get(name));
  }
  let primitives = 0;
  a.rig.root.traverse(n => { if (n instanceof THREE.Mesh) { primitives++; assert.equal(n.userData.sharedHumanGeometry, true); } });
  assert.equal(primitives, 26);
  first.get('char_mat_hair')!.color.set('#ff00ff');
  assert.ok(second.get('char_mat_hair')!.color.equals(original.get('char_mat_hair')!.color));
  a.dispose(); b.dispose();
});

test('user actions pose the new model while old profiles keep the delivered palette and the fallback remains customizable', async t => {
  canvas(t);
  const source = (await load()).scene, look = { skin: 5, hair: 4, style: 2 };
  const person = new Person('Human', '#ff00ff', look, source.clone(true));
  const before = new Map([...materials(person.root)].map(([k, v]) => [k, v.color.clone()]));
  person.setLook({ skin: 0, hair: 0, style: 0 }); person.setColor('#00ff00');
  for (const [k, v] of materials(person.root)) assert.ok(v.color.equals(before.get(k)!));
  assert.equal(person.usesBaseModel, true);
  assert.equal(person.skinColor, `#${before.get('char_mat_skin')!.getHexString()}`);
  assert.equal(person.shirtColor, `#${before.get('char_mat_clothing')!.getHexString()}`);
  person.update(0.1, 1, true, false);
  assert.notEqual(person.rig.legL.rotation.x, 0);
  assert.equal(person.rig.legL.rotation.x, -person.rig.legR.rotation.x);
  person.sit(0.6); person.update(0.1, 2, false, false);
  assert.equal(person.rig.legL.rotation.x, -1.35);
  assert.ok(Math.abs(person.rig.body.position.y - 0.18) < 0.00001);
  person.sit(null); person.reach(); person.update(0.1, 3, false, false);
  assert.ok(person.rig.armL.rotation.x < -0.1);
  person.setGrip('ladder'); person.update(0.1, 4, true, false);
  assert.ok(person.rig.armL.rotation.x < -2);
  person.setGrip('pole'); person.update(0.1, 5, false, false);
  assert.equal(person.rig.armL.rotation.z, 2.95);
  person.setGrip(null); person.update(1, 5.5, false, false);
  person.read(true); person.turnPage(); person.update(0.1, 6, false, false);
  assert.equal(person.rig.armL.rotation.x, -1.5);
  person.read(false); person.carry({ issue: 1, title: 'Example', office: 'example' } as any); person.update(0.1, 7, false, false);
  assert.equal(person.rig.armL.rotation.x, -1.25);
  person.setVoiceLevel(0.12); person.say('Hello'); person.update(0.1, 8, false, true);
  assert.ok(person.root.getObjectByName('char_mouth')!.visible, 'the delivered smile stays visible during speech');
  person.root.updateMatrixWorld(true);
  person.root.traverse(n => assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
  person.dispose();
  const fallback = new Person('Fallback', '#ff00ff', look);
  assert.equal(fallback.usesBaseModel, false);
  fallback.setColor('#00ff00'); assert.equal(fallback.shirtColor, '#00ff00');
  fallback.dispose();
});

test('first person hides only the local head, arms and labels and restores them after rendering', async t => {
  canvas(t);
  const source = (await load()).scene, person = new Person('Human', '#000000', { skin: 0, hair: 0, style: 0 }, source.clone(true));
  const other = humanBase(source.clone(true)), body = new FirstPersonBody(person.rig), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.5, 2); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  body.set(true, camera);
  assert.equal(person.rig.torso.scale.x, 0.8);
  assert.equal(person.rig.legL.position.z, 0.08);
  const restore = body.hideExtras();
  for (const part of [person.rig.head, person.rig.armL, person.rig.armR]) assert.equal(part.visible, false);
  for (const part of [person.rig.torso, person.rig.legL, person.rig.legR]) {
    assert.equal(part.visible, true); part.traverse(n => assert.equal(n.castShadow, false));
  }
  assert.equal(other.rig.head.visible, true);
  restore();
  assert.equal(person.rig.head.visible, true);
  person.rig.legL.traverse(n => { if (n instanceof THREE.Mesh) assert.equal(n.castShadow, true); });
  body.set(false, camera);
  assert.deepEqual(person.rig.torso.scale.toArray(), [1, 1, 1]);
  assert.equal(person.rig.legL.position.z, 0);
  assert.equal(person.rig.body.position.z, 0);
  person.dispose(); other.dispose();
});

test('closing a preview or removing a peer releases its materials without destroying cached user geometry', async t => {
  canvas(t);
  const source = (await load()).scene, look = { skin: 0, hair: 0, style: 0 };
  const preview = new Person('Preview', '#000000', look, source.clone(true)), world = new Person('World', '#000000', look, source.clone(true));
  let geometriesDisposed = 0, previewMaterialsDisposed = 0, worldMaterialsDisposed = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  source.traverse(n => { if (n instanceof THREE.Mesh) geometries.add(n.geometry); });
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometriesDisposed++);
  for (const material of materials(preview.root).values()) material.addEventListener('dispose', () => previewMaterialsDisposed++);
  for (const material of materials(world.root).values()) material.addEventListener('dispose', () => worldMaterialsDisposed++);
  preview.read(true); preview.setDoing('Example'); preview.say('Example'); preview.dispose();
  assert.equal(geometriesDisposed, 0);
  assert.equal(previewMaterialsDisposed, 12);
  assert.equal(worldMaterialsDisposed, 0);
  world.update(0.1, 1, true, false);
  const reopen = humanBase(source.clone(true));
  assert.ok(new THREE.Box3().setFromObject(reopen.rig.root).max.y > 1.76);
  assert.equal(geometriesDisposed, 0);
  world.dispose(); reopen.dispose();
});


test('all nine user colors are independent, preserve face accents and synchronize actual hand colors', async t => {
  canvas(t);
  const source = (await load()).scene, look = { skin: 0, hair: 0, style: 0 };
  const a = new Person('A', '#ffffff', look, source.clone(true)), b = new Person('B', '#ffffff', look, source.clone(true));
  const original = materials(source), first = materials(a.root), second = materials(b.root);
  for (const role of AVATAR_COLOR_ROLES) {
    assert.equal(first.get(`char_mat_${role}`)!.color.getHexString(), DEFAULT_AVATAR_COLORS[role].slice(1), role);
    const colors = { ...DEFAULT_AVATAR_COLORS, [role]: '#ff00ff' };
    a.setLook({ ...look, colors });
    for (const other of AVATAR_COLOR_ROLES) {
      assert.equal(first.get(`char_mat_${other}`)!.color.getHexString(), colors[other].slice(1));
      assert.ok(second.get(`char_mat_${other}`)!.color.equals(original.get(`char_mat_${other}`)!.color));
    }
    assert.ok(first.get('char_mat_dark')!.color.equals(original.get('char_mat_dark')!.color));
    assert.ok(first.get('char_mat_white')!.color.equals(original.get('char_mat_white')!.color));
    if (role === 'skin') assert.equal(a.skinColor, '#ff00ff');
    if (role === 'clothing') assert.equal(a.shirtColor, '#ff00ff');
  }
  a.setLook({ ...look, colors: { ...DEFAULT_AVATAR_COLORS } });
  const hair = a.root.getObjectByName('char_hair')!, brows = a.root.getObjectByName('char_eyebrows_visual')!;
  hair.visible = false;
  assert.equal(brows.parent, a.rig.head); assert.equal(brows.visible, true);
  a.dispose(); b.dispose();
});
