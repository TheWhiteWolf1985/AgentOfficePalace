import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AgentAssignment, AgentForgeView, ForgeRole } from '../shared/forgejo-agent.js';
import type { FloorDef } from './building.js';
import { repositoryName, serverUrl } from './connections/store.js';

type Target = Pick<FloorDef, 'id' | 'repo' | 'forgejoId'>;
interface Config { url: string; organization: string; token: string }
interface Identity extends AgentForgeView {
  id: string; floor: string; password: string; login: string; userId?: number; teamId?: number;
  tokenId?: number; secret?: string; repositoryId?: number; issuer?: string;
}
const privateDir = () => {
  const root = process.env.AGENT_OFFICE_CODEX_RUNTIME;
  if (!root || !path.isAbsolute(root)) throw Error('Runtime degli agenti non configurato');
  return path.join(root, 'forgejo-identities');
};
function filename(id: string) {
  if (!/^[0-9a-f]{12}$/.test(id)) throw Error('Identificativo agente non valido');
  return path.join(privateDir(), id + '.json');
}
function read(id: string): Identity | undefined {
  const file = filename(id);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}
function write(row: Identity) {
  mkdirSync(privateDir(), { recursive: true, mode: 0o700 });
  const file = filename(row.id);
  writeFileSync(file + '.new', JSON.stringify(row), { mode: 0o600 });
  renameSync(file + '.new', file);
}
export function forgeView(id: string): AgentForgeView | undefined {
  const row = read(id);
  if (row) return { role: row.role, tenure: row.tenure, status: row.status, username: row.userId ? row.login : undefined, repository: row.repository, error: row.error };
}
let queue: Promise<unknown> = Promise.resolve();
export function serializeForge<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work);
  queue = next.catch(() => {});
  return next;
}
function config(): Config {
  const file = process.env.AGENT_OFFICE_FLOOR_FORGEJO;
  if (!file) throw Error('Configurare il Forgejo locale in Gestione piani');
  const cfg: Config = JSON.parse(readFileSync(file, 'utf8'));
  cfg.url = serverUrl(cfg.url);
  if (!cfg.token || !/^[\w-]+$/.test(cfg.organization)) throw Error('Configurazione Forgejo non valida');
  return cfg;
}
function adminAuth() {
  const file = process.env.AGENT_OFFICE_FORGEJO_AGENT_ADMIN;
  if (!file || !existsSync(file)) throw Error('Credenziale di gestione degli utenti Forgejo da configurare');
  return 'token ' + readFileSync(file, 'utf8').trim();
}
export class ForgejoMergePending extends Error {}
async function api(cfg: Config, endpoint: string, method = 'GET', body?: object, auth = 'token ' + cfg.token, missing = false) {
  const res = await fetch(cfg.url + '/api/v1' + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (missing && res.status === 404) return;
  if (res.status === 405 && method === 'POST' && endpoint.endsWith('/merge')) {
    const detail = await res.json().catch(() => null);
    if (detail?.message === 'Please try again later') throw new ForgejoMergePending('Forgejo sta verificando la PR. Riprovare tra poco.');
  }
  if (!res.ok) throw Error('Forgejo ' + method + ' ' + endpoint + ' (HTTP ' + res.status + ')');
  const data = await res.text();
  return data ? JSON.parse(data) : undefined;
}
const basic = (login: string, password: string) => 'Basic ' + Buffer.from(login + ':' + password).toString('base64');
async function account(cfg: Config, row: Identity) {
  const admin = adminAuth(), route = '/admin/users/' + row.login;
  let user = await api(cfg, '/users/' + row.login, 'GET', undefined, admin, true);
  if (!user) {
    if (row.userId) throw Error('Account Forgejo rimosso esternamente');
    user = await api(cfg, '/admin/users', 'POST', { username: row.login, email: row.login + '@office.invalid',
      password: row.password, restricted: true, must_change_password: false, send_notify: false }, admin);
  }
  if (!Number.isSafeInteger(user.id) || user.is_admin || user.login !== row.login || (row.userId && user.id !== row.userId))
    throw Error('Identità Forgejo inattesa');
  // Recover an interrupted POST only after proving ownership with the locally generated secret.
  if (!row.userId && (await api(cfg, '/user', 'GET', undefined, basic(row.login, row.password))).id !== user.id)
    throw Error('Identità Forgejo non verificata');
  row.userId = user.id; write(row);
  await api(cfg, route, 'PATCH', { login_name: row.login, source_id: 0, restricted: true, prohibit_login: false,
    max_repo_creation: 0, allow_create_organization: false, allow_git_hook: false, allow_import_local: false }, admin);
}
const teamName = (repoId: number, role: ForgeRole) => 'aop-' + repoId + '-' + role;
async function team(cfg: Config, repo: string, repoId: number, role: ForgeRole) {
  const name = teamName(repoId, role), description = 'Agent Office Palace / ' + repoId + ' / ' + role;
  const units: Record<string,string> = { 'repo.code': 'write' };
  if (role !== 'operator') units['repo.pulls'] = role === 'chief' ? 'write' : 'read';
  // Team search omits teams the non-admin organization owner has not joined.
  const teams = '/orgs/' + cfg.organization + '/teams';
  let t;
  for (let page = 1; !t; page++) {
    const entries = await api(cfg, teams + '?limit=50&page=' + page);
    if (!entries.length) break;
    t = entries.find((entry: { name: string }) => entry.name === name);
  }
  if (!t) t = await api(cfg, '/orgs/' + cfg.organization + '/teams', 'POST', { name, description, units_map: units, can_create_org_repo: false, includes_all_repositories: false });
  if (!t || !Number.isSafeInteger(t.id) || t.description !== description || t.includes_all_repositories || t.can_create_org_repo || t.permission === 'admin' ||
    Object.entries(t.units_map ?? {}).some(([k,v]) => v !== 'none' && v !== units[k]) || Object.entries(units).some(([k,v]) => t.units_map?.[k] !== v))
    throw Error('Permessi del team Forgejo inattesi: ' + name);
  const assigned = await api(cfg, '/teams/' + t.id + '/repos?limit=2');
  if (assigned.some((r: {id:number}) => r.id !== repoId)) throw Error('Team già associato a un altro repository');
  if (!assigned.length) await api(cfg, '/teams/' + t.id + '/repos/' + repo, 'PUT');
  return t.id as number;
}
async function protect(cfg: Config, full: string, id: number, branch: string) {
  const chief = teamName(id, 'chief');
  await team(cfg, full, id, 'chief');
  const route = '/repos/' + full + '/branch_protections';
  let rule = await api(cfg, route + '/' + encodeURIComponent(branch), 'GET', undefined, undefined, true);
  if (!rule) rule = await api(cfg, route, 'POST', { branch_name: branch, rule_name: branch, enable_push: false,
    enable_merge_whitelist: true, merge_whitelist_teams: [chief], dismiss_stale_approvals: true, ignore_stale_approvals: true, required_approvals: 1,
    block_on_rejected_reviews: true });
  if (rule.enable_push || !rule.enable_merge_whitelist || rule.merge_whitelist_teams?.length !== 1 ||
    rule.merge_whitelist_teams[0] !== chief || rule.merge_whitelist_usernames?.length ||
    !rule.dismiss_stale_approvals || !rule.ignore_stale_approvals || rule.required_approvals < 1 || !rule.block_on_rejected_reviews)
    throw Error('La protezione esistente di ' + branch + ' richiede verifica amministrativa');
}
async function revoke(cfg: Config, row: Identity) {
  if (row.issuer && row.issuer !== cfg.url) throw Error('Il server Forgejo associato è cambiato');
  if (!row.userId) return;
  const admin = adminAuth();
  if ((await api(cfg, '/users/' + row.login, 'GET', undefined, admin)).id !== row.userId) throw Error('Identità Forgejo cambiata');
  const route = '/admin/users/' + row.login + '/tokens';
  for (const token of await api(cfg, route, 'GET', undefined, admin))
    if (token.name === 'office-worker') await api(cfg, route + '/' + token.id, 'DELETE', undefined, admin);
  if (row.teamId) await api(cfg, '/teams/' + row.teamId + '/members/' + row.login, 'DELETE', undefined, undefined, true);
  delete row.secret; delete row.tokenId; delete row.teamId; delete row.repositoryId; delete row.repository;
  await api(cfg, '/admin/users/' + row.login, 'PATCH', { login_name: row.login, source_id: 0, prohibit_login: true }, admin);
  write(row);
}
export async function assignForge(id: string, floor: Target, desired: AgentAssignment): Promise<AgentForgeView> {
  const existing = read(id);
  if (existing && existing.floor !== floor.id) throw Error('Agente associato a un altro piano');
  if (existing && existing.role === desired.role && existing.tenure === desired.tenure &&
      ((desired.tenure === 'temporary' && existing.status === 'none') ||
       (existing.status === 'ready' && existing.repositoryId === floor.forgejoId && existing.repository === floor.repo && existing.issuer === config().url)))
    return forgeView(id)!;
  const row: Identity = existing ?? { id, floor: floor.id, login: 'aop-' + id + '-' + randomBytes(3).toString('hex'),
    password: desired.tenure === 'permanent' ? randomBytes(32).toString('base64url') : '', ...desired, status: 'none' };
  if (desired.tenure === 'permanent' && !row.password) row.password = randomBytes(32).toString('base64url');
  row.role = desired.role; row.tenure = desired.tenure; row.status = 'pending'; delete row.error; write(row);
  try {
    if (row.userId) await revoke(config(), row);
    if (desired.tenure === 'permanent') {
      if (!floor.repo || !floor.forgejoId) throw Error('Collegare il repository privato del piano');
      const cfg = config(), full = repositoryName(floor.repo);
      if (full.split('/')[0] !== cfg.organization) throw Error('Collegare il repository privato del piano');
      const repo = await api(cfg, '/repos/' + full);
      if (!repo.private || repo.id !== floor.forgejoId || repo.full_name !== full) throw Error('Identità repository cambiata');
      row.issuer = cfg.url; write(row);
      await protect(cfg, full, repo.id, repo.default_branch);
      await account(cfg, row);
      row.teamId = await team(cfg, full, repo.id, desired.role);
      row.repository = full; row.repositoryId = repo.id; write(row);
      await api(cfg, '/teams/' + row.teamId + '/members/' + row.login, 'PUT');
      const token = await api(cfg, '/admin/users/' + row.login + '/tokens', 'POST', { name: 'office-worker', scopes: ['write:repository', 'write:issue'],
        repositories: [{ owner: cfg.organization, name: full.split('/')[1] }] }, adminAuth());
      if (!token.sha1) throw Error('Token personale non disponibile');
      row.secret = token.sha1; row.tokenId = token.id; row.status = 'ready';
    } else row.status = 'none';
  } catch (e) {
    row.error = (e as Error).message;
    if (row.userId) try { await revoke(config(), row); } catch { /* retained identifiers allow a later retry */ }
  }
  write(row); return forgeView(id)!;
}
export async function retireForge(id: string, preserveAssignment = false) {
  if (!process.env.AGENT_OFFICE_CODEX_RUNTIME) return;
  const row = read(id);
  if (!row) return;
  row.status = 'pending'; write(row);
  if (row.userId) await revoke(config(), row);
  if (!preserveAssignment) { row.status = 'none'; row.tenure = 'temporary'; }
  delete row.error; write(row);
}
export function floorIdentities(id: string) {
  if (!process.env.AGENT_OFFICE_CODEX_RUNTIME || !existsSync(privateDir())) return [];
  return readdirSync(privateDir()).filter(f => /^[0-9a-f]{12}\.json$/.test(f)).map(f => read(f.slice(0,-5))!)
    .filter(r => r.floor === id && (r.tenure === 'permanent' || r.teamId || r.secret)).map(r => ({id:r.id, role:r.role, tenure:r.tenure}));
}
export function workerForge(id: string, floor: Target) {
  const row = read(id), cfg = config();
  if (!row || row.status !== 'ready' || row.tenure !== 'permanent' || row.floor !== floor.id || !row.secret ||
    row.issuer !== cfg.url || !floor.forgejoId || row.repositoryId !== floor.forgejoId || row.repository !== floor.repo)
    throw Error('Accesso personale al repository non disponibile');
  const full = repositoryName(row.repository), login = row.login, role = row.role, token = row.secret;
  return { url: cfg.url, full, login, role, gitAuth: basic(login, token),
    api: (endpoint: string, method?: string, body?: object) => api(cfg, '/repos/' + full + endpoint, method, body, 'token ' + token) };
}
