import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installLoop } from '../src/client/core/loop.js';
import { Ticks } from '../src/client/core/registry.js';
import { RenderCadence } from '../src/client/graphics-settings.js';

test('the installed loop limits visual work while movement, networking, sound and view logic keep ticking', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = { hidden: false };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete (globalThis as any).document; });
  const calls = { movement: 0, sound: 0, network: 0, pose: 0, sky: 0, particles: 0, draw: 0, view: 0 };
  const ticks = new Ticks(), cadence = new RenderCadence(), camera = new THREE.PerspectiveCamera(50);
  const root = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group(), legL = new THREE.Group(), legR = new THREE.Group();
  root.add(body); body.add(torso, legL, legR);
  const player = {
    pos: new THREE.Vector3(), facing: 0, stepOffset: 0, view: 'third', moving: true, grounded: true, walkPhase: 0,
    effects: { speed: 1, jitter: 0, add: () => ({ jitter: 0 }) },
    update: (dt: number) => { calls.movement++; player.pos.x += dt; },
  };
  const ctx: any = {
    ticks, player, camera, reduceMotion: { matches: false },
    me: { root, rig: { root, body, torso, legL, legR }, setGrip() {}, setVoiceLevel() {}, update() { calls.pose++; } },
    hands: {}, voice: { inVoice: false }, office: {}, activities: { any: () => false },
    view: { grip: () => null, fov: () => 50, update: () => { calls.view++; }, draw: (_: unknown, draw: () => void) => draw() },
    sound: { update: () => { calls.sound++; }, setWeather() {}, step() {}, land() {} },
    sky: { rain: 0, daylight: 1, update: () => { calls.sky++; } },
    net: { send: () => { calls.network++; } }, dust: { update: () => { calls.particles++; } }, confetti: { update() {} },
    renderer: { render: () => { calls.draw++; } },
  };
  const parts: any = {
    stage: { scene: new THREE.Scene(), graphics: { shouldDraw: (now: number, hidden: boolean) => !hidden && cadence.due(now, 30), outline: false } },
    peers: { remotes: new Map() }, views: {}, place: { saveSpot() {} },
  };
  installLoop(ctx, { atLobby: true, upTop: false, thud: 0 } as any, parts, { offer2d() {} });
  for (let i = 0; i < 240; i++) {
    document.hidden = i >= 120 && i < 180;
    ticks.run({ delta: 1 / 120, dt: 1 / 120, t: i / 120, now: 1000 + i * 1000 / 120 });
  }
  assert.equal(calls.movement, 240); assert.equal(calls.sound, 240); assert.equal(calls.view, 240);
  assert.ok(calls.network > 10);
  assert.ok(Math.abs(calls.draw - 45) <= 1, JSON.stringify(calls));
  assert.equal(calls.sky, calls.draw); assert.equal(calls.pose, calls.draw); assert.equal(calls.particles, calls.draw);
  assert.ok(Math.abs(player.pos.x - 2) < 0.0001);
});
