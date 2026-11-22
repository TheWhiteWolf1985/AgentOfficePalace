import type { WorkerStatus } from '../../shared/protocol.js';
import { codexAtEmptyPrompt, codexStartupDialog } from '../codex.js';
import { providerAdapter } from '../providers/index.js';
import { screenText } from './terminal.js';
import type { Worker } from './types.js';

/** Inspect only the fresh terminal screen; real prompts remain actionable. */
export function checkBlocked(w: Worker, setStatus: (status: WorkerStatus) => void) {
  const s = w.info.status;
  // A previously blocked Codex may reach its prompt after onboarding or an update notice.
  // Only the live, fresh screen counts; never clear real questions or approvals by timeout.
  if (w.term && w.info.provider === 'codex' && (s === 'starting' || s === 'idle' || (w.bootBlocked && s === 'needs_input'))) {
    const text = screenText(w.term, w.term.buffer.active.type === 'normal' ? Math.max(0, w.fresh?.line ?? 0) : 0);
    if (w.info.runtime === 'docker' && codexStartupDialog(text)) {
      if (!w.bootBlocked || s !== 'needs_input') {
        w.bootBlocked = true;
        w.info.activity = 'Apri il terminale per esaminare la configurazione di Codex';
        setStatus('needs_input');
      }
      return;
    }
    if (w.bootBlocked && s === 'needs_input' && codexAtEmptyPrompt(text)) {
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
