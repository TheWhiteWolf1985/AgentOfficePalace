/** Shared synthesis primitives for the rooftop DJ. */

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** The same 0–1 for the same numbers, on everyone's machine. */
export function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

interface Buffers {
  noise: AudioBuffer;
  /** A small, dark room to put the keys and snare in. */
  room: AudioBuffer;
}
const made = new WeakMap<BaseAudioContext, Buffers>();

export function buffers(ctx: BaseAudioContext): Buffers {
  let b = made.get(ctx);
  if (b) return b;
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr * 3, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const room = ctx.createBuffer(2, Math.floor(sr * 1.6), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = room.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < d.length; i++) {
      low += (Math.random() * 2 - 1 - low) * 0.25;
      d[i] = low * Math.exp((-i / sr) * 3.4);
    }
  }
  b = { noise, room };
  made.set(ctx, b);
  return b;
}
