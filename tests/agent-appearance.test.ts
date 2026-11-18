import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { agentAppearanceForId, randomAgentAppearance, sanitizeAgentAppearance } from '../src/shared/agent-appearance.js';
import { AVATAR_HAIRSTYLES } from '../src/shared/avatar-variants.js';
import { DESK_BY_ID } from '../src/shared/layout.js';
import { restoreWorkers, saveWorkers } from '../src/server/workers/persist.js';
import { agentVisual } from '../src/client/world/character/agent-visual.js';
import { Worker } from '../src/client/world/character/worker.js';

const choice = { model: 'female', hairstyle: 'bald', colors: { iris: '#B16DE9', jaw: '#e7bc48', status: '#ff0000' } };

test('manual appearance admits only supported options and stable palettes never control status', () => {
  assert.deepEqual(sanitizeAgentAppearance(choice), { model: 'female', hairstyle: 'bald', colors: { iris: '#b16de9' } });
  assert.equal(sanitizeAgentAppearance({ model: 'female', hairstyle: '../../outside', colors: {} }), undefined);
  assert.deepEqual(sanitizeAgentAppearance({ model: 'male', hairstyle: 'bun', colors: { bow: '#123456', skin: 'url(x)' } })?.colors, {});
  assert.deepEqual(randomAgentAppearance(() => 0), sanitizeAgentAppearance(randomAgentAppearance(() => 0)));
  assert.deepEqual(randomAgentAppearance(() => .99), sanitizeAgentAppearance(randomAgentAppearance(() => .99)));
  assert.deepEqual(agentAppearanceForId('legacy-id'), agentAppearanceForId('legacy-id'));
});

test('worker storage preserves selected colors and derives stable defaults for legacy agents, not shells', t => {
  const folder = mkdtempSync(join(tmpdir(), 'agent-avatar-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'workers.json');
  const desks = [...DESK_BY_ID.values()].filter(desk => !desk.station && !desk.room).slice(0, 3);
  writeFileSync(file, JSON.stringify([
    { id: 'manual', deskId: desks[0].id, kind: 'agent', appearance: choice },
    { id: 'legacy', deskId: desks[1].id, kind: 'agent' },
    { id: 'shell', deskId: desks[2].id, kind: 'shell', appearance: choice },
  ]));
  const workers = new Map();
  restoreWorkers(file, workers, 'codex', () => false);
  assert.deepEqual(workers.get('manual').info.appearance, sanitizeAgentAppearance(choice));
  assert.deepEqual(workers.get('legacy').info.appearance, agentAppearanceForId('legacy'));
  assert.equal(workers.get('shell').info.appearance, undefined);
  saveWorkers(file, workers.values(), true);
  const restored = new Map();
  restoreWorkers(file, restored, 'codex', () => false);
  for (const [id, worker] of workers) assert.deepEqual(restored.get(id).info.appearance, worker.info.appearance);
});

async function scene(name: string) {
  const bytes = readFileSync(new URL(`../src/client/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

test('both worker rigs accept every hairstyle and survive desk, walking and celebration poses', async t => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = new Proxy({ measureText: (value: string) => ({ width: value.length * 18 }) }, { get: (object, key) => key in object ? object[key as keyof typeof object] : () => {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
  t.after(() => { if (desc) Object.defineProperty(globalThis, 'document', desc); else Reflect.deleteProperty(globalThis, 'document'); });
  const styleAssets = new Map(await Promise.all(AVATAR_HAIRSTYLES.map(async style => [style, style === 'bald' ? null : await scene('hair_' + style)] as const)));
  for (const model of ['male', 'female'] as const) {
    const source = await scene(`agent_${model}_base`);
    const original = new THREE.Box3().setFromObject(source, true);
    assert.ok(Math.abs(original.max.y - 1.7655) < 1e-5);
    for (const hairstyle of AVATAR_HAIRSTYLES) {
      const appearance = { model, hairstyle, colors: { iris: '#43abff' } };
      const visual = agentVisual(source.clone(true), styleAssets.get(hairstyle)?.clone(true) ?? null, appearance);
      const worker = new Worker('Agent', '#112233');
      const anchor = new THREE.Group();
      anchor.add(worker.root);
      worker.setVisual(visual, anchor);
      assert.equal(visual.root.getObjectByName('char_hair')!.children.length, hairstyle === 'bald' ? 0 : 1);
      assert.equal(!!visual.root.getObjectByName('char_bow_visual'), model === 'female');
      const statusNode = visual.root.getObjectByName('char_status')!;
      const materials = new Map<string, THREE.MeshToonMaterial>();
      visual.root.traverse(node => {
        if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.set(material.name, material);
      });
      const iris = materials.get('char_mat_iris')!;
      assert.equal(iris.color.getHexString(), '43abff');
      assert.equal(iris.emissive.getHexString(), '43abff');
      assert.equal(iris.emissiveIntensity, 0.35);
      worker.setStatus('working', false);
      worker.update(.1, 0);
      assert.equal(visual.root.getObjectByName('char_leg_negx')!.rotation.x, -1.35);
      const workingColor = materials.get('char_mat_status')!.color.getHex();
      worker.setStatus('needs_input', true);
      worker.update(.1, 1);
      assert.notEqual(materials.get('char_mat_status')!.color.getHex(), workingColor);
      assert.equal(iris.color.getHexString(), '43abff');
      assert.equal(statusNode.parent?.name, 'char_torso');
      worker.walking = true;
      worker.update(.1, 2);
      assert.ok(visual.root.position.y >= 0);
      worker.walking = false;
      worker.celebrate();
      worker.update(.1, 3);
      worker.root.updateMatrixWorld(true);
      worker.root.traverse(node => assert.ok(node.matrixWorld.elements.every(Number.isFinite)));
      worker.dispose();
    }
  }
});
