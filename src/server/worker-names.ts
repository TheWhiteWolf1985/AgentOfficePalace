import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkerName } from './workers/types.js';
import type { Ctx } from './office/context.js';

/** Closed floors still own their names. Unreadable state must not silently release them. */
export function buildingWorkerNames(ctx: Pick<Ctx,'building'|'floors'>): WorkerName[] {
  return ctx.building.list().flatMap(def => {
    const floor = ctx.floors.get(def.id);
    if (floor) return floor.workers.list();
    try {
      const saved = JSON.parse(readFileSync(path.join(def.dir,'.agent-office','workers.json'),'utf8'));
      if (!Array.isArray(saved)) throw Error('Formato degli agenti non valido');
      return saved.filter(w => w && typeof w.id === 'string' && typeof w.name === 'string')
        .map(w => ({id:w.id,name:w.name,createdAt:typeof w.createdAt === 'number' ? w.createdAt : 0}));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw Error('Impossibile verificare i nomi degli agenti del piano ' + def.name);
    }
  });
}
