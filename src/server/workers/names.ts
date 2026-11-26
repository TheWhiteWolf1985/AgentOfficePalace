import type { WorkerKind } from '../../shared/protocol.js';
import type { WorkerContext, WorkerName } from './types.js';
import { NAMES } from './worker.js';

export const cleanWorkerName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/gu,' ');
export const workerNameKey = (name: string) => cleanWorkerName(name).toLowerCase();

function pool(ctx: WorkerContext): WorkerName[] {
  const all = new Map([...(ctx.namePool?.() ?? [])].map(w => [w.id,w]));
  for (const w of ctx.workers.values()) all.set(w.info.id,w.info);
  return [...all.values()].filter(w => typeof w.id === 'string' && typeof w.name === 'string');
}

function freeName(base: string, taken: Set<string>): string {
  let name = cleanWorkerName(base).slice(0,100), number = 1;
  while (taken.has(workerNameKey(name))) {
    const suffix = ' (' + (++number) + ')';
    name = cleanWorkerName(base).slice(0,100-suffix.length) + suffix;
  }
  return name;
}

export function newWorkerName(ctx: WorkerContext, preferred: string | undefined, kind: WorkerKind): string {
  const taken = new Set(pool(ctx).map(w => workerNameKey(w.name.replace(/ 🐚$/,''))));
  const base = preferred ?? NAMES.find(n => !taken.has(workerNameKey(n))) ?? 'Worker';
  const name = freeName(base,taken);
  return kind === 'shell' ? name + ' 🐚' : name;
}

export function assertWorkerName(ctx: WorkerContext, id: string, name: string) {
  if (pool(ctx).some(w => w.id !== id && workerNameKey(w.name) === workerNameKey(name)))
    throw Error('Esiste già un agente con questo nome nell’edificio');
}

/** Resolve existing duplicates deterministically, preserving IDs, homes and sessions. */
export function reconcileWorkerNames(ctx: WorkerContext) {
  let all: WorkerName[];
  try { all = pool(ctx); }
  catch (error) { console.warn('agent-office: ' + (error as Error).message); return; }
  all.sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id));
  const reserved = new Set(all.map(w => workerNameKey(w.name)));
  const seen = new Set<string>();
  let changed = false;
  for (const info of all) {
    const base = cleanWorkerName(info.name) || 'Worker';
    const key = workerNameKey(base);
    const name = seen.has(key) ? freeName(base,reserved) : base;
    seen.add(key); reserved.add(workerNameKey(name));
    const local = ctx.workers.get(info.id);
    if (local && local.info.name !== name) { local.info.name = name; changed = true; }
  }
  if (changed) ctx.persist();
}
