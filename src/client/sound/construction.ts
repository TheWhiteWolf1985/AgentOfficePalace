/** The low impact when an office extension finishes building. */
import type { AudioCore } from './core';
import { pick } from './dsp';
import type { Pos } from './places';
export function construction(a: AudioCore, at: Pos) {
  if (!a.ctx) return;
  a.count('construction');
  const out = a.panner(at, 2, 1.1);
  out.connect(a.ambience);
  const t = a.ctx.currentTime + 0.005;
  a.play(pick(a.buf.steps), { gain: 0.8, rate: 0.85, dest: out });
  a.blip(out, t, 160, 0.6, 0.18, 0.22);
  a.blip(out, t + 0.01, 310, 0.8, 0.09, 0.07, 'triangle');
}
