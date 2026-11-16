/**
 * The frame loop, and the office's own parts of each frame: moving you, what you hear, telling the
 * office where you are, the building, the sky and drawing it all. They're registered before anything
 * else's (see installLoop), so within a phase they come first.
 */
import * as THREE from 'three';
import { SlowFrames } from '../framerate';
import { EYE_HEIGHT } from '../player';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import type { Parts } from './parts';
import type { Frame } from './registry';
import { FOV } from './scene';
import { FirstPersonBody } from '../world/character/person-first';

/** Covering less ground than this (m/s) since your last footstep, your feet make no sound: a walk is 4.6. */
const QUIET_FEET = 1.2;

export interface LoopDeps {
  /** Offers the 2D view (/lite), where the 3D is hard going (see main.ts). */
  offer2d(why: 'slow'): void;
}

/** Registers the office's own ticks: install it before anything else registers one. */
export function installLoop(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'stage' | 'peers' | 'views' | 'worlds' | 'place'>, deps: LoopDeps) {
  let landing: ReturnType<Ctx['player']['effects']['add']> | undefined;
  // Registered before anything else's, so within a phase they come first.
  ctx.ticks.add('pre', watchFrameRate);
  ctx.ticks.add('pre', easeShake);
  ctx.ticks.add('move', ({ dt }) => ctx.player.update(dt));
  ctx.ticks.add('me', moveMe);
  ctx.ticks.add('me', listen);
  ctx.ticks.add('me', tellWhereYouAre);
  ctx.ticks.add('world', updateWorld);
  ctx.ticks.add('env', updateSky);
  ctx.ticks.add('render', drawFrame);

  let lastSent = { x: 0, y: 0, z: 0, rotY: 0, moving: false, at: 0 };
  let spotSavedAt = 0;
  /** Which half-stride your walk is on, so each one plays a footstep. */
  let stride = 0;
  /** Where you were last frame, and how far and how long you've walked since your last footstep. */
  const walked = { x: 0, z: 0, far: 0, time: 0 };
  /** How fast you were falling, so landing a jump thumps but stepping down a stair doesn't. */
  let fallV = 0;
  const lookDir = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  /** Frames coming too slowly for the 3D to be any fun: the 2D view is offered. */
  const slowFrames = new SlowFrames();

  /** Frames coming too slowly for the 3D to be any fun: the 2D view is offered. */
  function watchFrameRate({ now, delta }: Frame) {
    if (slowFrames.frame(now, delta * 1000)) deps.offer2d('slow');
  }

  /** The view's shake easing off after a pole landing or a hiccup. */
  function easeShake({ dt }: Frame) {
    core.thud = Math.max(0, core.thud - dt * 2.5);
    (landing ??= ctx.player.effects.add()).jitter = ctx.reduceMotion.matches ? 0 : core.thud;
  }

  /** Your body below you in first person (made on the first frame, once you are). */
  let firstBody: FirstPersonBody | null = null;

  /** You as everyone else sees you, your hands as you see them, and the camera's view. */
  function moveMe({ dt, t }: Frame) {
    const { player, me, hands, voice, camera } = ctx;
    me.root.position.copy(player.pos);
    me.root.position.y += player.stepOffset;
    me.root.rotation.y = player.facing;
    // Holding on to the ladder or a pole (see ctx.view).
    const grip = ctx.view.grip();
    me.setGrip(grip);
    me.update(dt, t, (player.moving && player.grounded) || (grip === 'ladder' && player.moving), !player.grounded && !grip && !ctx.activities.any('hidesHands'), player.effects.speed);
    me.setVoiceLevel(voice.inVoice ? voice.localLevel : 0);
    const firstPerson = player.view === 'first';
    // In first person you are the camera; in third, hide yourself when it's zoomed in right behind your head.
    // At the tee the camera's behind the ball, and you're the one holding the club.
    // So is the camera over your shoulder at the dart board or the axe lane.
    // In first person your body's there below you (see FirstPersonBody), unless your hands are busy elsewhere (a car's wheel).
    const ownBody = firstPerson && !ctx.activities.any('takesCamera') && !ctx.activities.any('hidesHands');
    (firstBody ??= new FirstPersonBody(me.rig)).set(ownBody, camera);
    me.root.visible = ownBody || ctx.activities.any('takesCamera') || (!firstPerson && camera.position.distanceTo(headPos.set(player.pos.x, player.pos.y + 1.3, player.pos.z)) > 1.5);
    if (firstPerson && !ctx.activities.any('hidesHands')) hands.update(dt, t, { yaw: player.camYaw, pitch: player.lookPitch, walkPhase: player.walkPhase, walking: player.moving && player.grounded, airborne: !player.grounded, jitter: player.effects.jitter, grip });
    // Activities such as sliding down a pole can widen the field of view.

    const fov = ctx.view.fov(FOV);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }
    ctx.view.update();
  }

  /** What you hear, from where you are, and your footsteps. */
  function listen({ dt }: Frame) {
    const { player, camera, sound } = ctx;
    // Your ears are in your head, facing wherever the camera looks.
    camera.getWorldDirection(lookDir);
    sound.update({ x: player.pos.x, y: player.pos.y + EYE_HEIGHT, z: player.pos.z, fx: lookDir.x, fz: lookDir.z });
    const walking = player.moving && player.grounded;
    walked.far = walking ? walked.far + Math.hypot(player.pos.x - walked.x, player.pos.z - walked.z) : 0;
    walked.time = walking ? walked.time + dt : 0;
    walked.x = player.pos.x;
    walked.z = player.pos.z;
    const s = Math.floor(player.walkPhase / Math.PI);
    if (s !== stride) {
      stride = s;
      // Only for ground you've covered: walking into a wall, your feet go nowhere and make no sound.
      if (walking && walked.far > walked.time * QUIET_FEET) sound.step(player.pos, player.running ? 1 : 0);
      walked.far = walked.time = 0;
    }
    if (!player.grounded) fallV = Math.min(fallV, player.vy);
    else {
      // A hop lands at about 6 m/s, a drop from the loft at 10.
      if (fallV < -4) sound.land(player.pos, Math.min(1, (-fallV - 4) / 7));
      fallV = 0;
    }
  }

  /** Where you are: to everyone else a few times a second, and to come back to every second. */
  function tellWhereYouAre({ now }: Frame) {
    const { player, net } = ctx;
    const moved = Math.abs(player.pos.x - lastSent.x) + Math.abs(player.pos.y - lastSent.y) + Math.abs(player.pos.z - lastSent.z) > 0.01 || Math.abs(player.facing - lastSent.rotY) > 0.02;
    if ((moved || player.moving !== lastSent.moving) && now - lastSent.at > 66) {
      lastSent = { x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing, moving: player.moving, at: now };
      net.send({ t: 'move', x: player.pos.x, y: player.pos.y, z: player.pos.z, rotY: player.facing, moving: player.moving });
    }
    // Where you are, to come back to next time.
    if (now - spotSavedAt > 1000) {
      spotSavedAt = now;
      parts.place.saveSpot();
    }
  }

  function updateWorld({ dt, t }: Frame) {
    const { player, office, camera } = ctx;
    const { remotes } = parts.peers;
    const { departures, arrivals } = parts.views;
    if (!core.upTop && !core.atLobby) {
      ctx.world().update(t, dt, [player.pos, ...[...remotes.values()].map((r) => r.person.root.position), ...departures.positions(), ...arrivals.positions()]);
      if (ctx.inOffice()) {
        office.stack.update(dt, [{ x: player.pos.x, y: player.pos.y, z: player.pos.z, grip: ctx.view.grip() }, ...[...remotes.values()].map((r) => ({ x: r.person.root.position.x, y: r.person.root.position.y, z: r.person.root.position.z, grip: r.grip }))], camera.position);
      }
    }
    ctx.dust.update(dt, camera);
    ctx.confetti.update(dt);
  }

  /** The sky, the weather and the light. */
  function updateSky({ dt, t }: Frame) {
    const { camera, sky, sound } = ctx;
    sky.update(dt, t, camera);

    sound.setWeather(sky.rain, 1 - sky.daylight);
  }

  /** Draws the frame through the current view filters (see ctx.view). */
  function drawFrame(f: Frame) {
    ctx.view.draw(f, drawScene);
  }

  /** The scene, then your hands on top of it. */
  function drawScene() {
    const { player, hands, sky, camera, renderer } = ctx;
    const { effect, scene } = parts.stage;
    const firstPerson = player.view === 'first';
    const unhide = firstBody?.hideExtras();
    effect.render(scene, camera);
    unhide?.();

    if (firstPerson && !ctx.view.covered() && !ctx.activities.any('hidesHands')) {
      // Hands go on top of everything, so they never clip into a desk you walk up to. They have
      // lights of their own, turned down to match wherever you're standing.
      renderer.clearDepth();
      hands.setLight(sky.lightAt(camera.position));
      sky.shading(false);
      effect.render(hands.scene, hands.camera);
      sky.shading(true);
    }
  }
}

/**
 * The frame loop: each frame, every phase's ticks, in order (see TICK_PHASES, and installLoop). Its
 * clock starts now; hand what it returns to requestAnimationFrame to start it.
 */
export function frameLoop(ctx: Ctx, loading: { drew(): void }): (ts?: number) => void {
  const timer = new THREE.Timer();
  function frame(ts?: number) {
    timer.update(ts);
    const delta = timer.getDelta();
    ctx.ticks.run({ delta, dt: Math.min(delta, 0.1), t: timer.getElapsed(), now: performance.now() });
    loading.drew();
    requestAnimationFrame(frame);
  }
  return frame;
}
