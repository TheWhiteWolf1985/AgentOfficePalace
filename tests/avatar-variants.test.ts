import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Person, type PersonAssets } from '../src/client/world/character/person.js';
import { FirstPersonBody } from '../src/client/world/character/person-first.js';
import { AVATAR_HAIRSTYLES, avatarModel, avatarHairstyle } from '../src/shared/avatar-variants.js';
import { DEFAULT_AVATAR_COLORS, DEFAULT_BOW_COLOR, sanitizeAvatarColors } from '../src/shared/avatar-colors.js';
import { sameLook, sanitizeLook, type Look } from '../src/shared/avatar.js';

const legacy = { skin: 2, hair: 3, style: 6 };
async function load(file: string) {
  const bytes = readFileSync(new URL(`../src/client/models/${file}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const sources = Promise.all([load('human_base'), load('female_base'), ...AVATAR_HAIRSTYLES.filter(s => s !== 'bald').map(s => load('hair_' + s))]);
async function library() {
  const [male, female, ...hair] = await sources;
  const styles = AVATAR_HAIRSTYLES.filter(s => s !== 'bald');
  const assets: PersonAssets = { body: model => (model === 'female' ? female : male).clone(true), hair: style => style === 'bald' ? null : hair[styles.indexOf(style)].clone(true) };
  return { assets, all: [male, female, ...hair] };
}
function canvas(t: TestContext) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 20 }) }, { get: (o, k) => k in o ? o[k as keyof typeof o] : () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  t.after(() => { if (before) Object.defineProperty(globalThis, 'document', before); else delete (globalThis as any).document; });
}
function material(root: THREE.Object3D, name: string): THREE.MeshToonMaterial {
  let result: THREE.Material | undefined;
  root.traverse(n => { if (n instanceof THREE.Mesh) result ??= (Array.isArray(n.material) ? n.material : [n.material]).find(m => m.name === name); });
  assert.ok(result, name); return result as THREE.MeshToonMaterial;
}
function triangles(root: THREE.Object3D): string[] {
  root.updateMatrixWorld(true);
  const result: string[] = [];
  root.traverse(n => {
    if (!(n instanceof THREE.Mesh)) return;
    const p = n.geometry.getAttribute('position'), index = n.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const vertices = [0, 1, 2].map(offset => {
        const v = new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + offset) : i + offset).applyMatrix4(n.matrixWorld);
        return v.toArray().map(value => (Math.round(value * 1e5) / 1e5).toFixed(5)).join(',');
      });
      result.push(vertices.sort().join(';'));
    }
  });
  return result.sort();
}

test('old profiles remain male/short while new stable choices and bow colors validate without losing fallbacks', () => {
  assert.deepEqual(sanitizeLook(legacy, legacy), legacy);
  assert.equal(avatarModel(legacy), 'male'); assert.equal(avatarHairstyle(legacy), 'short');
  assert.equal(avatarHairstyle({ model: 'female' }), 'long');
  const female: Look = { ...legacy, model: 'female', hairstyle: 'bun', colors: { ...DEFAULT_AVATAR_COLORS, bow: '#123456' } };
  assert.deepEqual(sanitizeLook({ model: '../../evil', hairstyle: 'unknown' }, female), female);
  assert.deepEqual(sanitizeLook(legacy, female), female, 'older clients do not erase the selected body, hair or bow');
  assert.equal(sameLook(legacy, { ...legacy, model: 'male', hairstyle: 'short' }), true);
  assert.equal(sameLook(legacy, female), false);
  assert.equal(sanitizeAvatarColors({ version: 1, bow: '#ABCDEF' }).bow, '#abcdef');
  assert.equal(sanitizeAvatarColors({ version: 1, bow: 'transparent' }, female.colors).bow, '#123456');
});

test('all fourteen body/style combinations preserve the fixed bow, independent brows and actual controller poses', async t => {
  canvas(t); const { assets } = await library();
  for (const model of ['male', 'female'] as const) for (const hairstyle of AVATAR_HAIRSTYLES) {
    const look: Look = { ...legacy, model, hairstyle, colors: { ...DEFAULT_AVATAR_COLORS, hair: '#112233', bow: '#2244ff' } };
    const person = new Person('A', '#ffffff', look, assets.body(model)!, assets);
    const reference = assets.body(model)!;
    const originalHair = reference.getObjectByName('char_hair')!;
    originalHair.clear();
    const component = assets.hair(hairstyle);
    if (component) originalHair.add(component);
    assert.deepEqual(triangles(person.rig.body), triangles(reference), `${model}/${hairstyle}: runtime preserves the delivered rest geometry and attaches hair at identity`);
    const hair = person.root.getObjectByName('char_hair')!;
    let hairMeshes = 0; hair.traverse(n => { if (n instanceof THREE.Mesh) hairMeshes++; });
    assert.equal(hairMeshes, hairstyle === 'bald' ? 0 : 1, `${model}/${hairstyle}`);
    assert.equal(person.root.getObjectByName('char_eyebrows_visual')!.parent, person.rig.head);
    const bow = person.root.getObjectByName('char_bow_visual');
    assert.equal(!!bow, model === 'female');
    if (bow) {
      assert.equal(bow.parent, person.rig.head); assert.ok(bow.visible);
      assert.equal(material(bow, 'char_mat_bow').color.getHexString(), '2244ff');
      assert.equal(material(person.root, 'char_mat_tie').color.getHexString(), DEFAULT_BOW_COLOR.slice(1));
    }
    if (hairstyle !== 'bald') assert.equal(material(hair, 'char_mat_hair').color.getHexString(), '112233');
    for (const mode of ['walk', 'sit', 'read', 'ladder', 'pole', 'air'] as const) {
      person.sit(mode === 'sit' ? 0.6 : null); person.read(mode === 'read');
      person.setGrip(mode === 'ladder' || mode === 'pole' ? mode : null);
      person.update(0.1, 1, mode === 'walk' || mode === 'ladder', mode === 'air');
      person.root.updateMatrixWorld(true);
      person.root.traverse(n => assert.ok(n.matrixWorld.elements.every(Number.isFinite), `${model}/${hairstyle}/${mode}`));
    }
    const fp = new FirstPersonBody(person.rig); fp.set(true, new THREE.PerspectiveCamera());
    const restore = fp.hideExtras(); assert.equal(person.rig.head.visible, false); restore();
    assert.equal(person.rig.head.visible, true); person.dispose();
  }
});

test('changing bodies preserves the scene root, rig identity, held objects and first-person rendering state', async t => {
  canvas(t); const { assets } = await library();
  const person = new Person('A', '#ffffff', legacy, assets.body('male')!, assets), root = person.root, rig = person.rig, oldBody = rig.body;
  const scene = new THREE.Group(); scene.add(root); root.position.set(1, 0, 2); root.rotation.y = 0.7;
  person.carry({ issue: 1, title: 'Example' }); person.read(true); person.say('Hello'); person.setDoing('Reading'); person.sit(0.6);
  const owned: THREE.Mesh[] = []; root.traverse(n => { if (n instanceof THREE.Mesh && !n.userData.sharedHumanGeometry) owned.push(n); });
  const fp = new FirstPersonBody(rig), camera = new THREE.PerspectiveCamera(); fp.set(true, camera);
  person.setLook({ ...legacy, model: 'female', hairstyle: 'bald' });
  assert.equal(person.root, root); assert.equal(person.rig, rig); assert.equal(root.parent, scene); assert.notEqual(rig.body, oldBody);
  assert.deepEqual(root.position.toArray(), [1, 0, 2]); assert.equal(root.rotation.y, 0.7); assert.equal(person.pose, 'sit');
  for (const prop of owned) assert.equal(root.getObjectById(prop.id), prop, 'held objects and mic stay attached');
  fp.set(true, camera); assert.equal(rig.torso.scale.x, 0.8); assert.equal(rig.legL.position.z, 0.08);
  const restore = fp.hideExtras(); assert.equal(rig.head.visible, false); restore();
  fp.set(false, camera); assert.deepEqual(rig.torso.scale.toArray(), [1, 1, 1]);
  person.update(0.1, 1, false, false); assert.equal(rig.legL.rotation.x, -1.35);
  person.setLook(legacy); assert.equal(root.getObjectByName('char_bow_visual'), undefined);
  assert.equal(person.root, root); person.dispose();
});

test('repeated body and hair changes isolate instance colors and never dispose cached model geometry/materials', async t => {
  canvas(t); const { assets, all } = await library(); let disposed = 0;
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const source of all) source.traverse(n => { if (n instanceof THREE.Mesh) { geometry.add(n.geometry); for (const m of Array.isArray(n.material) ? n.material : [n.material]) materials.add(m); } });
  for (const value of [...geometry, ...materials]) value.addEventListener('dispose', () => disposed++);
  const a = new Person('A', '#ffffff', legacy, assets.body('male')!, assets), b = new Person('B', '#ffffff', { ...legacy, model: 'female' }, assets.body('female')!, assets);
  for (let i = 0; i < 28; i++) {
    a.setLook({ ...legacy, model: i % 2 ? 'male' : 'female', hairstyle: AVATAR_HAIRSTYLES[i % 7], colors: { ...DEFAULT_AVATAR_COLORS, skin: '#ff00ff', bow: '#0000ff' } });
    assert.equal(material(b.root, 'char_mat_skin').color.getHexString(), DEFAULT_AVATAR_COLORS.skin.slice(1));
    assert.equal(material(b.root, 'char_mat_bow').color.getHexString(), DEFAULT_BOW_COLOR.slice(1));
  }
  a.dispose(); b.dispose(); assert.equal(disposed, 0);
});
