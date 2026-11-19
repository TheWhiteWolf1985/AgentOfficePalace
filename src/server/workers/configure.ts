import { randomAgentAppearance, sanitizeAgentAppearance } from '../../shared/agent-appearance.js';
import type { WorkerConfiguration } from '../../shared/connections.js';
import type { WorkerContext } from './types.js';
import { isAgentProvider } from '../../shared/providers.js';
import { DESK_BY_ID } from '../../shared/layout.js';
import { validateWorkerEffort, validateWorkerModel } from '../agents.js';
import { midTurn } from './lifecycle.js';

/** A user edits configuration; generated status, history and session identifiers stay immutable. */
export async function configureWorker(ctx: WorkerContext, id: string, input: WorkerConfiguration): Promise<void> {
  const w = ctx.workers.get(id);
  if (!w) throw Error('Agente non trovato');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || /[\x00-\x1f]/.test(input.name)) throw Error('Nome dell’agente non valido');
  if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) throw Error('Colore non valido');
  const desk = DESK_BY_ID.get(input.deskId), previous = DESK_BY_ID.get(w.info.deskId);
  if (!desk || desk.station !== previous?.station || !!desk.room !== !!previous?.room) throw Error('Scrivania non compatibile con questo agente');
  if ([...ctx.workers.values()].some((other) => other !== w && other.info.deskId === desk.id)) throw Error('La scrivania e occupata');
  if (input.prompt !== undefined && (typeof input.prompt !== 'string' || input.prompt.length > 20000)) throw Error('Istruzioni troppo lunghe');
  if (w.info.kind === 'agent' && (!input.provider || !isAgentProvider(input.provider))) throw Error('Provider non valido');
  const problem = validateWorkerModel(w.info.kind, input.provider, input.model) || validateWorkerEffort(w.info.kind, input.provider, input.effort);
  if (problem) throw Error(problem);
  const changed = input.provider !== w.info.provider || input.model !== w.info.model || input.effort !== w.info.effort || input.prompt !== w.info.prompt;
  if ((changed || input.deskId !== w.info.deskId || input.restart) && (midTurn(w) || w.info.status === 'needs_input')) throw Error('L’agente sta lavorando o attende una risposta: completare il turno prima di cambiarne la configurazione');
  if (changed && (w.pty || w.dsh) && !input.restart) throw Error('Confermare una nuova sessione per applicare modello o istruzioni');
  if (w.info.runtime === 'docker' && (input.provider !== 'codex' || input.restart || (changed && !w.info.paused))) throw Error('Ferma il container prima di modificare modello o istruzioni, poi riavvialo dalla gestione agenti');
  if (input.restart && w.info.meeting) throw Error('Un agente in riunione si gestisce dalla sala riunioni');
  if (input.restart) {
    w.pty?.kill(); w.dsh?.close();
    for (let attempts = 0; (w.pty || w.dsh) && attempts < 50; attempts++) await new Promise((resolve) => setTimeout(resolve, 100));
    if (w.pty || w.dsh) throw Error('La sessione non si e fermata: configurazione non applicata');
  }
  if (w.info.kind === 'agent' && input.appearance !== undefined) {
    const look = input.appearance === 'random' ? randomAgentAppearance() : sanitizeAgentAppearance(input.appearance);
    if (!look) throw Error('Avatar non valido');
    w.info.appearance = look;
  }
  Object.assign(w.info, { name: input.name.trim(), color: input.color, deskId: input.deskId, provider: input.provider, model: input.model || undefined, effort: input.effort, prompt: input.prompt?.trim() || undefined });
  if ((changed || input.restart) && w.info.runtime !== 'docker') { w.info.sessionId = undefined; w.saved = undefined; }
  ctx.emit(w); ctx.persist();
  if (input.restart) { const error = ctx.resume(id, w.info.prompt); if (error) throw Error(error); }
}
