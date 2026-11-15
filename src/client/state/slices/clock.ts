import type { Slice } from '../store';
declare module '../store' {
  interface Store {
    clock?: { offset: number; rtt: number };
    /** Shared server clock for weather and the rooftop DJ. */
    officeNow(): number;
  }
}
export const clock: Slice = {
  init(s) { s.clock = undefined; },
  methods: { officeNow() { return this.clock ? performance.now() + this.clock.offset : Date.now(); } },
  on: {
    welcome(s) { s.clock = undefined; },
    pong(s, m) {
      const rtt = performance.now() - m.at;
      if (s.clock && rtt >= s.clock.rtt) return;
      s.clock = { offset: m.now - (m.at + rtt / 2), rtt };
    },
  },
};
