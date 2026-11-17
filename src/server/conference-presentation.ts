import type { PresentationState } from '../shared/protocol/presentation.js';

/** No drawing is stored here: changing display mode can never overwrite the persistent whiteboard. */
export class ConferencePresentation {
  private current: PresentationState = { mode: 'whiteboard', revision: 0 };
  state(): PresentationState { return { ...this.current }; }
  select(presenter?: string): PresentationState {
    if (this.current.presenter === presenter) return this.state();
    this.current = { mode: presenter ? 'presentation' : 'whiteboard', ...(presenter ? { presenter } : {}), revision: this.current.revision + 1 };
    return this.state();
  }
  release(id: string): boolean {
    if (this.current.presenter !== id) return false;
    this.select(); return true;
  }
}
