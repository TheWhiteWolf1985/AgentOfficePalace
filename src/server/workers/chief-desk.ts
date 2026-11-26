import { CHIEF_DESK, DESK_BY_ID, nextFreeSeat } from '../../shared/layout.js';
import type { AgentAssignment, ForgeRole } from '../../shared/forgejo-agent.js';
import type { WorkerInfo } from '../../shared/protocol.js';
import { assignForge, forgeView } from '../forgejo-agents.js';
import type { Worker, WorkerContext } from './types.js';

export async function changeOfficeRole(ctx: WorkerContext, id: string, floor: Parameters<typeof assignForge>[1], desired: AgentAssignment, wing: number) {
  const w = ctx.workers.get(id);
  if (!w || w.info.runtime !== 'docker') throw Error('Agente Docker non trovato');
  const previous = w.info.deskId;
  w.info.deskId = assignmentDesk([...ctx.workers.values()].map(w => w.info), desired.role, id, wing);
  let access;
  try {
    access = await assignForge(id, floor, desired);
  } catch (error) {
    w.info.deskId = previous;
    ctx.persist(); ctx.emit(w);
    throw error;
  }
  ctx.persist();
  ctx.emit(w);
  return access;
}

/** Placement follows the saved assignment. Repository permissions still come from Forgejo. */
export function officeRole(worker: WorkerInfo): ForgeRole | undefined {
  return worker.runtime === 'docker' && process.env.AGENT_OFFICE_CODEX_RUNTIME ? forgeView(worker.id)?.role : undefined;
}

export function assignmentDesk(workers: Iterable<WorkerInfo>, role: ForgeRole, id?: string, wing = 0, roleOf = officeRole): string {
  const list = [...workers], current = list.find(w => w.id === id);
  if (role === 'chief') {
    if (list.some(w => w.id !== id && (w.deskId === CHIEF_DESK.id || roleOf(w) === 'chief')))
      throw Error('Questo ufficio ha già un Capo ufficio');
    if (current && (DESK_BY_ID.get(current.deskId)?.station || current.meeting)) throw Error('Questa postazione non può diventare Capo ufficio');
    return CHIEF_DESK.id;
  }
  if (current && current.deskId !== CHIEF_DESK.id) return current.deskId;
  const desk = nextFreeSeat(d => list.some(w => w.id !== id && w.deskId === d), wing);
  if (!desk) throw Error('Nessuna scrivania libera');
  return desk.id;
}

/** Upgrade old desks without changing the agent process, workspace or access. */
export function restoreChiefDesk(workers: Map<string, Worker>, roleOf = officeRole): boolean {
  const chief = [...workers.values()].find(w => roleOf(w.info) === 'chief');
  const occupant = [...workers.values()].find(w => w.info.deskId === CHIEF_DESK.id);
  if (!chief && occupant) {
    const free = nextFreeSeat(d => [...workers.values()].some(w => w.info.deskId === d));
    if (!free) return false;
    occupant.info.deskId = free.id;
    return true;
  }
  if (!chief || chief.info.deskId === CHIEF_DESK.id) return false;
  if (occupant) occupant.info.deskId = chief.info.deskId;
  chief.info.deskId = CHIEF_DESK.id;
  return true;
}
