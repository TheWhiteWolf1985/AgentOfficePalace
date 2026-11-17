import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyPreferences, type PersonalPreferences } from '../shared/personal-settings.js';

/** Separate from accounts.json, so profile saves never rewrite credentials or admin-managed accounts. */
export class PersonalPreferencesStore {
  private file: string;
  constructor(dataDir: string) { this.file = path.join(dataDir, 'personal-preferences.json'); }
  private read(): { accounts: Map<string, PersonalPreferences>; devices: Record<string, Record<string, number>> } {
    if (!existsSync(this.file)) return { accounts: new Map(), devices: {} };
    const raw = JSON.parse(readFileSync(this.file, 'utf8'));
    if (raw?.version !== 1 || !raw.accounts || typeof raw.accounts !== 'object' || Array.isArray(raw.accounts)) throw new Error('Unreadable personal preferences');
    if (raw.devices !== undefined) {
      if (!raw.devices || typeof raw.devices !== 'object' || Array.isArray(raw.devices)) throw new Error('Unreadable preference sequences');
      for (const value of Object.values(raw.devices)) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(n => !Number.isSafeInteger(n) || (n as number) < 0)) throw new Error('Unreadable preference sequences');
      }
    }
    return { accounts: new Map(Object.entries(raw.accounts).map(([id, value]) => [id, applyPreferences({}, value)])), devices: raw.devices ?? {} };
  }
  get(account: string): PersonalPreferences | null { return this.read().accounts.get(account) ?? null; }
  sequence(account: string, device?: string): number {
    if (!device || !/^[0-9a-f]{32}$/.test(device)) return 0;
    return this.read().devices[account]?.[device] ?? 0;
  }
  update(account: string, patch: unknown, onlyIfEmpty = false, mutation?: { device: string; sequence: number }): PersonalPreferences {
    const snapshot = this.read(), all = snapshot.accounts;
    if (mutation && (!/^[0-9a-f]{32}$/.test(mutation.device) || !Number.isSafeInteger(mutation.sequence) || mutation.sequence < 1)) throw new Error('Invalid preference sequence');
    if (mutation && mutation.sequence <= (snapshot.devices[account]?.[mutation.device] ?? 0)) return all.get(account) ?? {};
    const current = all.get(account);
    if (onlyIfEmpty && current) return current;
    const next = applyPreferences(current ?? {}, patch);
    all.set(account, next);
    if (mutation) {
      const devices = { ...(snapshot.devices[account] ?? {}) };
      delete devices[mutation.device]; devices[mutation.device] = mutation.sequence;
      snapshot.devices[account] = Object.fromEntries(Object.entries(devices).slice(-64));
    }
    const temp = this.file + '.tmp';
    writeFileSync(temp, JSON.stringify({ version: 1, accounts: Object.fromEntries(all), devices: snapshot.devices }) + '\n', { mode: 0o600 });
    renameSync(temp, this.file);
    return next;
  }
}
