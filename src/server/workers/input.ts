import type { WorkerContext } from './types.js';
import { truncate } from './util.js';
import { codexAtEmptyPrompt, codexStartupDialog } from '../codex.js';
import { screenText } from './terminal.js';

export function assignTask(ctx: WorkerContext, id: string, text: string, by: string, owner?: string): boolean {
  const w = ctx.workers.get(id);
  if (!w || w.owner !== owner || w.info.kind !== 'agent' || w.info.paused || w.bootBlocked ||
      (w.info.status !== 'idle' && w.info.status !== 'done') || (!w.pty && !w.dsh)) return false;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return false;
  if (w.pty && w.term && w.info.provider === 'codex') {
    const buffer = w.term.buffer.active;
    const line = buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? '';
    const marker = line.match(/^\s*[›>]\s?/);
    if (marker && buffer.cursorX > marker[0].length) return false;
  }
  if (submitPrompt(ctx, id, text, by)) return false;
  ctx.setStatus(w, 'working');
  return true;
}

/** Types a prompt into the agent's input box and submits it; `by` is the person who sent it, if any. */
export function submitPrompt(ctx: WorkerContext, id: string, text: string, by?: string): string | undefined {
  const w = ctx.workers.get(id);
  if (!w) return 'No such worker';
  if (w.dsh) {
    const clean = text.replace(/\r\n?/g, '\n').trim();
    if (!clean) return 'Empty prompt';
    w.dsh.prompt(clean);
    w.info.activity = truncate(clean, 80);
    ctx.notePrompt(w, clean);
    if (by) w.info.lastInput = { by, at: Date.now() };
    ctx.emit(w);
    return undefined;
  }
  if (!w.pty) return 'Worker is not running';
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return 'Empty prompt';
  if (w.info.runtime === 'docker' && w.info.provider === 'codex' && w.term) {
    const screen = screenText(w.term, w.term.buffer.active.type === 'normal' ? w.fresh?.line : 0);
    if (codexStartupDialog(screen) || (!w.info.sessionId && !codexAtEmptyPrompt(screen))) {
      return 'Codex non è ancora pronto a ricevere incarichi';
    }
  }
  // Bracketed paste keeps multi-line prompts in one message, then Enter submits.
  w.pty.write(`\x1b[200~${clean}\x1b[201~`);
  setTimeout(() => w.pty?.write('\r'), 120);
  w.info.activity = truncate(clean, 80);
  ctx.notePrompt(w, clean);
  if (by) w.info.lastInput = { by, at: Date.now() };
  ctx.emit(w);
  return undefined;
}
