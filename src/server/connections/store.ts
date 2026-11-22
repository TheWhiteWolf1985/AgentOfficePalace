import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitServer, GitAccount, GitBinding, GitConnectionsState } from '../../shared/connections.js';

const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const id = () => randomBytes(10).toString('hex');
export function checkedId(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw Error('Identificativo non valido');
  return value;
}
export function repositoryName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || !/^[\w.-]+\/[\w.-]+$/.test(value) || value.split('/').some((p) => p === '.' || p === '..')) throw Error('Repository non valida: usare proprietario/nome');
  return value;
}
export function serverUrl(value: unknown): string {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Indirizzo del server non valido');
  return url.href.replace(/\/$/, '');
}
const name = (v: unknown) => { if (typeof v !== 'string' || !v.trim() || v.length > 100) throw Error('Inserire un nome, massimo 100 caratteri'); return v.trim(); };
function atomic(file: string, value: string): void {
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temp, value, { mode: 0o600 });
  renameSync(temp, file);
}

/** Connection metadata and credentials live outside project workspaces. */
export class ConnectionsStore {
  private data: GitConnectionsState;
  constructor(readonly root: string) {
    mkdirSync(path.join(root, 'accounts'), { recursive: true, mode: 0o700 });
    const file = path.join(root, 'connections.json');
    this.data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { servers: [], accounts: [], bindings: [] };
    if (!Array.isArray(this.data.servers) || !Array.isArray(this.data.accounts) || !Array.isArray(this.data.bindings)) throw Error('Archivio connessioni non valido');
    // Only the current connection contract is exposed; extra fields in older files are ignored.
    this.data.bindings = this.data.bindings.map((binding) => ({
      dir: binding.dir, floorId: binding.floorId, accountId: binding.accountId, repository: binding.repository,
      agents: Object.fromEntries(Object.entries(binding.agents ?? {}).map(([workerId, assignment]) => [workerId, { accountId: assignment.accountId }])),
    }));
  }
  snapshot(): GitConnectionsState { return structuredClone(this.data); }
  private save() {
    atomic(path.join(this.root, 'connections.json'), JSON.stringify(this.data, null, 2));
  }
  server(serverId: string): GitServer { const s = this.data.servers.find((s) => s.id === checkedId(serverId)); if (!s) throw Error('Server non trovato'); return s; }
  account(accountId: string): GitAccount { const a = this.data.accounts.find((a) => a.id === checkedId(accountId)); if (!a) throw Error('Account non trovato'); return a; }
  token(accountId: string): string {
    this.account(accountId);
    const text = readFileSync(path.join(this.root, 'accounts', checkedId(accountId) + '.env'), 'utf8');
    const value = JSON.parse(text.replace(/^TOKEN=/, '').trim());
    if (typeof value !== 'string' || !value || /[\x00-\x20\x7f]/.test(value)) throw Error('Credenziale non disponibile');
    return value;
  }
  putServer(input: { id?: string; name: string; provider: string; url: string }): GitServer {
    if (input.provider !== 'github' && input.provider !== 'forgejo') throw Error('Provider non valido');
    const server: GitServer = { id: input.id ? checkedId(input.id) : id(), name: name(input.name), provider: input.provider, url: serverUrl(input.url) };
    const old = this.data.servers.find((s) => s.id === server.id);
    if (old && (old.url !== server.url || old.provider !== server.provider) && this.data.accounts.some((a) => a.serverId === server.id)) throw Error('Il server ha account collegati: creare una nuova connessione per cambiare indirizzo');
    this.data.servers = [...this.data.servers.filter((s) => s.id !== server.id), server]; this.save(); return structuredClone(server);
  }
  putAccount(input: { id?: string; serverId: string; name: string; username?: string; token?: string }): GitAccount {
    this.server(input.serverId);
    const old = input.id ? this.account(input.id) : undefined;
    if (old && old.serverId !== input.serverId) throw Error('Un account non puo cambiare server');
    if ((!old || input.token) && (typeof input.token !== 'string' || !input.token || input.token.length > 4096 || /[\x00-\x20\x7f]/.test(input.token))) throw Error('Token non valido');
    const account: GitAccount = { id: old?.id ?? id(), serverId: input.serverId, name: name(input.name), username: input.username?.trim() ?? old?.username ?? '' };
    if (!input.token && old) { account.verifiedAt = old.verifiedAt; account.error = old.error; }
    if (old && account.username !== old.username) account.verifiedAt = undefined;
    if (input.token) atomic(path.join(this.root, 'accounts', account.id + '.env'), 'TOKEN=' + JSON.stringify(input.token) + '\n');
    this.data.accounts = [...this.data.accounts.filter((a) => a.id !== account.id), account]; this.save(); return structuredClone(account);
  }
  verification(accountId: string, username: string, error?: string): void {
    const a = this.account(accountId);
    if (!error && a.username && a.username.toLowerCase() !== username.toLowerCase()) error = 'Il token appartiene a un altro utente';
    a.error = error; a.verifiedAt = error ? undefined : Date.now();
    if (!error) a.username = username;
    this.save();
    if (error) throw Error(error);
  }
  binding(dir: string): GitBinding | undefined { const b = this.data.bindings.find((b) => path.resolve(b.dir) === path.resolve(dir)); return b && structuredClone(b); }
  bind(input: GitBinding): GitBinding {
    const account = this.account(input.accountId);
    if (!account.verifiedAt) throw Error('Verificare prima l’account');
    const binding: GitBinding = { dir: path.resolve(input.dir), floorId: checkedId(input.floorId), accountId: account.id, repository: repositoryName(input.repository), agents: {} };
    for (const [workerId, assignment] of Object.entries(input.agents ?? {})) {
      checkedId(workerId);
      if (assignment.accountId) {
        const a = this.account(assignment.accountId);
        if (a.serverId !== account.serverId || !a.verifiedAt) throw Error('Account dell’agente non verificato o di un altro server');
      }
      binding.agents[workerId] = { accountId: assignment.accountId || undefined };
    }
    this.data.bindings = [...this.data.bindings.filter((b) => path.resolve(b.dir) !== binding.dir), binding]; this.save(); return structuredClone(binding);
  }
  remove(kind: 'server' | 'account', key: string): void {
    checkedId(key);
    if (kind === 'server') {
      if (this.data.accounts.some((a) => a.serverId === key)) throw Error('Rimuovere prima gli account del server');
      this.data.servers = this.data.servers.filter((s) => s.id !== key);
    } else {
      if (this.data.bindings.some((b) => b.accountId === key || Object.values(b.agents).some((a) => a.accountId === key))) throw Error('Account ancora assegnato a un ufficio o agente');
      this.account(key); this.data.accounts = this.data.accounts.filter((a) => a.id !== key);
      unlinkSync(path.join(this.root, 'accounts', key + '.env'));
    }
    this.save();
  }
  unbind(dir: string) {
    const remaining = this.data.bindings.filter(b => path.resolve(b.dir) !== path.resolve(dir));
    if (remaining.length !== this.data.bindings.length) {
      atomic(path.join(this.root, 'connections.json'), JSON.stringify({ ...this.data, bindings: remaining }, null, 2));
      this.data.bindings = remaining;
    }
  }
  selected(dir: string, workerId?: string): { binding: GitBinding; account: GitAccount; server: GitServer } | undefined {
    const binding = this.binding(dir); if (!binding) return;
    const assignment = workerId ? binding.agents[workerId] : undefined;
    const accountId = assignment?.accountId ?? binding.accountId;
    const account = this.account(accountId);
    if (!account.verifiedAt) throw Error('Account da verificare in Impostazioni GitHub e Forgejo');
    return { binding, account: structuredClone(account), server: structuredClone(this.server(account.serverId)) };
  }
}
let current: { root: string; store: ConnectionsStore } | undefined;
export function connections(): ConnectionsStore {
  const root = process.env.AGENT_OFFICE_CONNECTIONS_DIR ?? path.join(os.homedir(), '.config', 'agent-office', 'connections');
  if (current?.root !== root) current = { root, store: new ConnectionsStore(root) };
  return current.store;
}
