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
    const args = codexModelArgs([], info.model, info.effort);
    args.push(...codexHookArgs('/office-bridge/agent-office-codex-hook.cjs', 'node'), '--no-alt-screen');
    if (resume) args.push('resume', resume);
    if (prompt) args.push('--', prompt);
    this.ctx.persist();
    void serialWorker(info.id, async () => {
      const launch = await prepareContainer(info, this.ctx.cwd(info), w.hookToken, args);
      if (this.ctx.workers.get(info.id) !== w || this.stopping.has(info.id) || this.ctx.closing || info.paused) return;
      attach(launch);
      this.ctx.emit(w); this.ctx.persist();
    }).catch(e => failed(e.message)).finally(() => this.provisioning.delete(info.id));
  }

  async pause(id: string) {
    const w = this.ctx.workers.get(id);
    if (w?.info.runtime !== 'docker') throw Error('Agente Docker non trovato');
    if (this.stopping.has(id)) throw Error('Operazione già in corso');
    this.stopping.add(id);
    try {
      w.info.paused = true; this.ctx.persist();
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
