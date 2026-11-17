import type { PresentationState } from '../../../shared/protocol';
import { ROOF } from '../../../shared/rooftop';
import type { Slice } from '../store';

declare module '../store' {
  interface Store { presentation: PresentationState }
  interface Topics { presentation: true }
}
export const presentation: Slice = {
  init(s) { s.presentation = { mode: 'whiteboard', revision: 0 }; },
  on: {
    'conference.presentation'(s, m) {
      if (s.floor !== ROOF || m.state.revision < s.presentation.revision) return;
      s.presentation = m.state; return ['presentation'];
    },
  },
  enter(s, v) {
    s.presentation = v.floor === ROOF ? v.presentation ?? { mode: 'whiteboard', revision: 0 } : { mode: 'whiteboard', revision: 0 };
    return ['presentation'];
  },
};
