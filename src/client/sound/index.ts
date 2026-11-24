/** Office sounds and alerts, weather and footsteps. */
import { construction } from './construction';
import type { GongWhy } from '../../shared/protocol';
import { birdsong, nightCrickets, startRoomTone, startWind } from './ambience';
import { ding } from './alerts';
import { AudioCore, type Listener } from './core';
import { gong } from '../features/gong/sound';
import { needsYou } from '../features/needsyou/sound';
import type { Pos } from './places';
import { Footsteps, pageTurn, paper } from './steps';
import { fidgeting, Typing } from './typing';
import { Rain, thunder } from './weather';

export class OfficeSound {
  private readonly a: AudioCore = new AudioCore({ start: (ctx) => this.start(ctx) });
  private readonly typing = new Typing(this.a);
  private readonly feet = new Footsteps(this.a);
  private readonly rain = new Rain(this.a);
  private readonly birds = birdsong(this.a);
  private readonly crickets = nightCrickets(this.a);
  private readonly fidgets = fidgeting(this.a, this.typing);
  /** How many of each sound have played, for quick checks from the console. */
  readonly played: Record<string, number> = this.a.played;

  constructor() {
    // What the room does every frame, in this order (it's the order the random numbers are drawn in).
    this.a.every((now) => this.typing.scheduleTyping(now));
    this.a.every((now) => this.birds.tick(now));
    this.a.every((now) => this.crickets.tick(now));
    this.a.every((now) => this.rain.tickRain(now));
    this.a.every((now) => this.fidgets.tick(now));
  }

  /** Audio has just started (see AudioCore.unlock): start the room ambience. */
  private start(ctx: AudioContext) {
    this.a.applyVolume();
    this.a.applyVisibility();
    startRoomTone(this.a);
    startWind(this.a);
    this.a.applyOutdoors();
    const now = ctx.currentTime;
    this.birds.start(now);
    this.crickets.start(now);
    this.fidgets.start(now);
  }

  // ---- The room and you ---------------------------------------------------------------------------

  /** Volume is 0–1; muted silences everything without losing the level. */
  setVolume(volume: number, muted: boolean) {
    this.a.setVolume(volume, muted);
  }

  /** The weather outside (see world/sky.ts), every frame. */
  setWeather(rain: number, night: number) {
    this.a.setWeather(rain, night);
  }

  /** Output level (RMS) right now, for headless checks. */
  level(): number {
    return this.a.level();
  }

  get state(): AudioContextState | 'locked' {
    return this.a.state;
  }

  /** How many rows the floor's back office is built out: in there you're indoors too. */
  get wing(): number {
    return this.a.wing;
  }

  set wing(level: number) {
    this.a.wing = level;
  }

  /** Moves your ears and schedules whatever the room does next. */
  update(l: Listener) {
    this.a.update(l);
  }

  /** Up on the roof (true), or inside on a floor: the office's hum gives way to the wind and the city. */
  setOutdoors(on: boolean) {
    this.a.setOutdoors(on);
  }

  // ---- Workers, footsteps and paper (typing.ts, steps.ts) ---------------------------------------

  /** The worker at desk (x, z) types while `on`. */
  setTyping(id: string, x: number, z: number, on: boolean) {
    this.typing.setTyping(id, x, z, on);
  }

  removeTypist(id: string) {
    this.typing.removeTypist(id);
  }

  /** One of your own footsteps, with your feet at `feet`: `pace` is 0 at a walk, 1 at a run. */
  step(feet: Pos, pace = 0) {
    this.feet.step(feet, pace);
  }

  /** Landing a jump, `hard` from 0 (a hop) to 1 (off the loft). */
  land(feet: Pos, hard = 0.5) {
    this.feet.land(feet, hard);
  }

  paper() {
    paper(this.a);
  }

  pageTurn() {
    pageTurn(this.a);
  }

  /** Someone else's footstep, on the office floor unless `y` says where else. */
  stepAt(x: number, z: number, y = 0, pace = 0) {
    this.feet.stepAt({ x, y, z }, pace);
  }

  construction(at: Pos) { construction(this.a, at); }

  thunder(delay: number, loud: number) {
    thunder(this.a, delay, loud);
  }

  gong(why: GongWhy) {
    gong(this.a, why);
  }

  ding(kind: 'done' | 'needs_input') {
    ding(this.a, kind);
  }

  /** The alarm for a worker that needs you, or (`again`) the soft reminder while it still does. */
  needsYou(again = false) {
    needsYou(this.a, again);
  }

}
