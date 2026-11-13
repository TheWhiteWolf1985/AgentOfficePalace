import type { WorkerStatus } from '../../shared/protocol.js';
import { codexAtEmptyPrompt } from '../codex.js';
import { providerAdapter } from '../providers/index.js';
import { screenText } from './terminal.js';
import type { Worker } from './types.js';

/** Inspect only the fresh terminal screen; real prompts remain actionable. */
export function checkBlocked(w: Worker, setStatus: (status: WorkerStatus) => void) {
  const s = w.info.status;
  // A previously blocked Codex may reach its prompt after onboarding or an update notice.
  // Only the live, fresh screen counts; never clear real questions or approvals by timeout.
  if (w.term && w.info.provider === 'codex' && w.bootBlocked && s === 'needs_input') {
    const text = screenText(w.term, w.term.buffer.active.type === 'normal' ? Math.max(0, w.fresh?.line ?? 0) : 0);
    if (codexAtEmptyPrompt(text)) {
      w.bootBlocked = false;
      w.info.activity = undefined;
      setStatus('idle');
      return;
    }
  }
  const blockedBy = w.info.kind === 'agent' ? providerAdapter(w.info.provider)?.screen?.blocked : undefined;
  if (!w.term || !blockedBy) return;
  if (s !== 'starting' && s !== 'idle' && !(w.bootBlocked && s === 'needs_input')) return;
  // Only this run's output counts: a "Not logged in" in the scrollback from before is old news.
  const text = screenText(w.term, w.term.buffer.active.type === 'normal' ? Math.max(0, w.fresh?.line ?? 0) : 0);
  const blocked = blockedBy(text, s === 'starting' || !!w.bootBlocked);
  if (blocked && s !== 'needs_input') {
    w.bootBlocked = true;
    w.info.activity = blocked;
    setStatus('needs_input');
  } else if (!blocked && w.bootBlocked && s === 'needs_input') {
    w.bootBlocked = false;
    w.info.activity = undefined;
    setStatus('idle');
  }
}
