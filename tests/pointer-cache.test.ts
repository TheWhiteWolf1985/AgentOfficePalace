import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneRaycast } from '../src/client/input/scene-raycast.js';
import { installPointer } from '../src/client/input/pointer.js';
import { Interactions, Ticks } from '../src/client/core/registry.js';
import { EYE_HEIGHT } from '../src/client/player/index.js';

function fixture() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const root = new THREE.Group(), door = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
  panel.position.z = -4; root.add(panel);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
  blocker.position.z = -2; door.add(blocker); root.add(door);
  return { camera, root, door, panel, blocker, cache: new SceneRaycast(), center: new THREE.Vector2() };
}

test('stationary picking reuses intersections and detects moving occluders before a draw', () => {
  const f = fixture(); let casts = 0;
  const original = f.panel.raycast;
  f.panel.raycast = function (ray, hits) { casts++; original.call(this, ray, hits); };
  const pick = () => f.cache.intersect(f.camera, f.center, [f.root], 7)[0]?.object;
  assert.equal(pick(), f.blocker);
  for (let i = 0; i < 144; i++) assert.equal(pick(), f.blocker);
  assert.equal(casts, 1);
  f.door.position.x = 3;
  assert.equal(pick(), f.panel, 'a parent transform invalidates the cache without renderer matrix updates');
  assert.equal(casts, 2);
  f.root.position.x = 3; assert.equal(pick(), undefined);
  f.root.position.x = 0; assert.equal(pick(), f.panel);
  f.root.remove(f.panel); assert.equal(pick(), undefined);
  f.root.add(f.panel); assert.equal(pick(), f.panel);
});

test('camera, geometry edits, visibility, layers and material sides invalidate cached hits', () => {
  const f = fixture();
  const pick = () => f.cache.intersect(f.camera, f.center, [f.root], 7);
  let casts = 0;
  const original = f.blocker.raycast;
  f.blocker.raycast = function (ray, hits) { casts++; original.call(this, ray, hits); };
  pick();
  f.blocker.visible = false; pick(); assert.equal(casts, 2);
  f.door.position.x = 3;
  assert.equal(pick()[0].object, f.panel);
  const version = f.panel.geometry.getAttribute('position');
  for (let i = 0; i < version.count; i++) version.setX(i, version.getX(i) + 3);
  version.needsUpdate = true;
  f.panel.geometry.computeBoundingSphere();
  assert.equal(pick().length, 0);
  f.panel.geometry = new THREE.BoxGeometry(1, 1, 0.1); assert.equal(pick()[0].object, f.panel);
  f.panel.layers.set(1); assert.equal(pick().length, 0);
  f.panel.layers.set(0); assert.equal(pick()[0].object, f.panel);
  f.camera.position.x = 4; assert.equal(pick().length, 0);
  f.camera.position.x = 0; f.camera.fov = 45; f.camera.updateProjectionMatrix(); assert.equal(pick()[0].object, f.panel);
  f.panel.material.side = THREE.BackSide;
  assert.ok(pick()[0].distance > 4, 'the back face is picked after a side change');
});

test('bounded picking keeps third-person camera offset and UVs; far clicks can still see distant geometry', () => {
  const f = fixture(); f.root.remove(f.door);
  f.camera.position.z = 10;
  assert.equal(f.cache.intersect(f.camera, f.center, [f.root], 7).length, 0);
  const hits = f.cache.intersect(f.camera, f.center, [f.root], 17);
  assert.equal(hits[0].object, f.panel); assert.ok(hits[0].uv);
  f.panel.position.z = -30;
  assert.equal(f.cache.intersect(f.camera, f.center, [f.root], 17).length, 0);
  assert.equal(f.cache.intersect(f.camera, f.center, [f.root], Infinity)[0].object, f.panel);
});

test('normal pointer entry points recheck doors and interaction availability before using E', () => {
  const f = fixture(); f.camera.position.y = EYE_HEIGHT; f.panel.position.y = f.blocker.position.y = EYE_HEIGHT;
  const target = { kind: 'whiteboard', x: 0, z: -4, radius: 5 };
  f.panel.userData.interact = target;
  let used = 0;
  const interactions = new Interactions<any>();
  interactions.define('whiteboard', { reach: 7, hint: () => ({}), use: () => { used++; } });
  const ticks = new Ticks();
  const player = { pos: new THREE.Vector3(), view: 'first', onClick: (_: THREE.Vector2) => {} };
  const ctx: any = {
    player, camera: f.camera, canvas: { addEventListener() {} }, office: { group: f.root },
    interactions, ticks, activities: { busy: () => false, any: () => false }, usables: { pickables: () => [], lists: () => [] },
  };
  const parts: any = {
    worlds: { plan: () => ({ byId: new Map() }) }, rooftop: { roof: () => null },
    you: { reach() {} }, boards: { issuesTex: { lift() {} } },
    seating: { mySeat: () => null }, hintbar: { renderHint() {}, renderCrosshair() {} },
    hanging: { hanger: { active: false } },
  };
  const pointer = installPointer(ctx, { atLobby: false, upTop: false } as any, parts);
  ticks.run({ delta: 0.016, dt: 0.016, t: 0, now: 0 });
  assert.equal(pointer.target(), null);
  f.door.position.x = 3;
  assert.equal(pointer.currentTarget(), target);
  assert.ok(pointer.use(pointer.currentTarget(), 'E')); assert.equal(used, 1);
  f.door.position.x = 0;
  player.onClick(f.center); assert.equal(used, 1, 'a newly closed door blocks a click before the next frame');
  f.door.position.x = 3; target.off = true;
  assert.equal(pointer.currentTarget(), null);
});
