import type { Frame } from './registry';

/** Accumulate animation time between draws, dropping hidden-tab time on resume. */
export class VisualClock {
  private elapsed = 0;
  advance(frame: Frame, draw: boolean, hidden: boolean): Frame | null {
    if (hidden) { this.elapsed = 0; return null; }
    this.elapsed += frame.dt;
    if (!draw) return null;
    const dt = Math.min(this.elapsed, 0.1);
    this.elapsed = 0;
    return { ...frame, delta: dt, dt };
  }
}
