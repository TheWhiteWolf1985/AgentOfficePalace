import { codexHookArgs, codexModelArgs } from '../codex.js';
import { prepareContainer, serialWorker, stopContainer, retireContainer } from './docker.js';
import type { Worker, WorkerContext } from './types.js';

type Prepared = Awaited<ReturnType<typeof prepareContainer>>;

export class DockerWorkers {
  private provisioning = new Set<string>();
  private stopping = new Set<string>();
  constructor(private ctx: WorkerContext) {}
  busy(id: string) { return this.provisioning.has(id) || this.stopping.has(id); }

  launch(w: Worker, prompt: string | undefined, resume: string | undefined, attach: (p: Prepared) => void, failed: (message: string) => void) {
    const { info } = w;
    if (this.busy(info.id)) return;
    this.provisioning.add(info.id);
    const engine = { model: info.model, effort: info.effort };
    const args = codexModelArgs([], engine.model, engine.effort);
    args.push(...codexHookArgs('/office-bridge/agent-office-codex-hook.cjs', 'node'), '--no-alt-screen');
    if (resume) args.push('resume', resume);
    if (prompt) args.push('--', prompt);
    this.ctx.persist();
    void serialWorker(info.id, async () => {
      const launch = await prepareContainer(info, this.ctx.cwd(info), w.hookToken, args);
      if (this.ctx.workers.get(info.id) !== w || this.stopping.has(info.id) || this.ctx.closing || info.paused) return;
      if (launch.created) info.containerEngine = engine;
      attach(launch);
      this.ctx.emit(w); this.ctx.persist();
    }).catch(e => failed(e.message)).finally(() => {
      this.provisioning.delete(info.id);
      if (this.ctx.workers.get(info.id) === w) this.applyWhenIdle(w);
    });
  }

  /** A saved choice follows this worker across turns without interrupting an answer or login. */
  applyWhenIdle(w: Worker) {
    const { info } = w, engine = info.containerEngine;
    if (!engine || (engine.model === info.model && engine.effort === info.effort)) return;
    if (!w.pty || !info.sessionId || info.paused || this.busy(info.id) || this.ctx.closing) return;
    if (info.status !== 'done' && info.status !== 'idle') return;
    // A finished turn can still be flushing its last output or have an unsent draft.
    // Only the live input line at the cursor is relevant, not a prompt in scrollback.
    const buffer = w.term?.buffer.active;
    const line = buffer?.getLine(buffer.baseY + buffer.cursorY);
    const input = line?.translateToString(true);
    const marker = input?.match(/^\s*[›>]\s?/);
    if (!buffer || !line || !input || !marker || buffer.cursorX > marker[0].length) return;
    const text = input.slice(marker[0].length);
    if (text && text !== 'Ask Codex to do anything' && !line.getCell(marker[0].length)?.isDim()) return;
    void this.pause(info.id, true).then(() => {
      if (this.ctx.closing || info.paused || this.ctx.workers.get(info.id) !== w) return;
      const error = this.ctx.resume(info.id);
      if (error) throw Error(error);
    }).catch(() => this.ctx.events.toast(info.name + ': impostazioni salvate. Riavvia il container per attivarle.', 'warn'));
  }

  async pause(id: string, reconfigure = false) {
    const w = this.ctx.workers.get(id);
    if (w?.info.runtime !== 'docker') throw Error('Agente Docker non trovato');
    if (this.stopping.has(id)) throw Error('Operazione già in corso');
    this.stopping.add(id);
    try {
      w.info.paused = !reconfigure; this.ctx.persist();
      await serialWorker(id, () => stopContainer(id));
      w.pty?.kill(); w.pty = undefined;
      this.ctx.setStatus(w, 'offline'); this.ctx.persist();
    } catch (error) { w.info.paused = false; this.ctx.persist(); throw error; }
    finally { this.stopping.delete(id); }
  }

  async retire(id: string) {
    if (this.stopping.has(id)) throw Error('Operazione già in corso');
    this.stopping.add(id);
    try { return await serialWorker(id, () => retireContainer(id)); }
    finally { this.stopping.delete(id); }
  }
}
