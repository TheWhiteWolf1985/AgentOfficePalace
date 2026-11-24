import { renameSync, writeFileSync } from 'node:fs';

/** A floor as floors.json keeps it. */
export interface FloorDef {
  id: string;
  name: string;
  /** owner/name on GitHub. */
  repo?: string;
  /** Immutable identity on the configured private Forgejo. */
  forgejoId?: number;
  dir: string;
  palette: number;
  addedBy: string;
  addedAt: number;
}

export function writeFloorRegistry(file: string, defs: FloorDef[]) {
  const temp = file + '.new';
  writeFileSync(temp, JSON.stringify(defs, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}
