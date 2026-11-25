import { assignForge, floorIdentities, retireForge, serializeForge } from './forgejo-agents.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { MAX_FLOORS } from '../shared/floors.js';
import { LOBBY } from '../shared/rooftop.js';
import { officeRepoName, type FloorManagementView } from '../shared/floor-management.js';
import type { Ctx } from './office/context.js';
import type { Client } from './office/client.js';
import type { FloorDef } from './building.js';
import type { Floor } from './floor.js';
import { connections, repositoryName, serverUrl } from './connections/store.js';
import { cloneRepository, verifyGit } from './connections/git.js';

interface ForgeConfig { url: string; organization: string; token: string; readerAccountId: string }
interface Repository { id: number; full_name: string; private: boolean }
interface Input { floorId?: string; version?: string; name?: string; workspace?: string; repository?: string; existing?: boolean; deleteRemote?: boolean; confirmation?: string }

export const hasFloorForge = () => !!process.env.AGENT_OFFICE_FLOOR_FORGEJO;
function config(): ForgeConfig {
  if (!hasFloorForge()) throw Error('Forgejo privato da configurare sul server');
  const data: ForgeConfig = JSON.parse(readFileSync(process.env.AGENT_OFFICE_FLOOR_FORGEJO!, 'utf8'));
  const store = connections();
  const server = store.server(store.account(data.readerAccountId).serverId);
  if (server.provider !== 'forgejo' || server.url !== serverUrl(data.url) || !data.token || !/^[a-z\d][\w-]*$/i.test(data.organization))
    throw Error('Configurazione del Forgejo privato non valida');
  return data;
}
async function forge(cfg: ForgeConfig, endpoint: string, method = 'GET', body?: object) {
  const response = await fetch(cfg.url + '/api/v1' + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'token ' + cfg.token, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (response.status === 404 && method === 'GET') return undefined;
  if (!response.ok) throw Error('Forgejo ha risposto HTTP ' + response.status + '. Verificare permessi e disponibilità del repository.');
  return response.status === 204 ? undefined : await response.json();
}
function repoPath(cfg: ForgeConfig, raw: string) {
  const full = repositoryName(raw.includes('/') ? raw : cfg.organization + '/' + raw);
  if (full.split('/')[0].toLowerCase() !== cfg.organization.toLowerCase()) throw Error('Scegliere un repository dell’organizzazione ' + cfg.organization);
  return full;
}
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const version = (def: FloorDef) => JSON.stringify([def.addedAt, def.id, def.dir, def.name, def.repo ?? '', def.forgejoId ?? 0]);
function ownership(ctx: Ctx): Record<string, number> {
  const file = path.join(ctx.cfg.dataDir, 'managed-repositories.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}
const key = (cfg: ForgeConfig, repo: string) => cfg.url + '/' + repo.toLowerCase();
function remember(ctx: Ctx, cfg: ForgeConfig, repo: Repository) {
  const file = path.join(ctx.cfg.dataDir, 'managed-repositories.json');
  const data = ownership(ctx);
  data[key(cfg, repo.full_name)] = repo.id;
  writeFileSync(file + '.new', JSON.stringify(data), { mode: 0o600 });
  renameSync(file + '.new', file);
}
export function floorManagement(ctx: Ctx): FloorManagementView {
  const cfg = hasFloorForge() ? config() : undefined;
  const owned = ownership(ctx);
  return { configured: !!cfg, organization: cfg?.organization ?? '', root: ctx.building.projectsDir,
    floors: ctx.building.list().map(def => ({ id: def.id, name: def.name, dir: def.dir, repo: def.repo ?? '',
      version: version(def), canDeleteRepo: !!(def.forgejoId && def.repo && cfg && owned[key(cfg, def.repo)] === def.forgejoId) })) };
}
function nested(child: string, parent: string) {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep));
}
function destination(ctx: Ctx, raw: string, current?: string) {
  const root = realpathSync(ctx.building.projectsDir);
  const dir = path.resolve(root, raw);
  if (dir === current) return dir;
  const rel = path.relative(root, dir);
  if (!rel || !nested(dir, root) || rel.split(path.sep).some(part => part.startsWith('.'))) throw Error('Scegliere una sottocartella della radice dei workspace');
  if (realpathSync(path.dirname(dir)) !== path.dirname(dir)) throw Error('La cartella padre non può essere un collegamento');
  if (ctx.building.list().some(f => nested(dir, f.dir) || nested(f.dir, dir))) throw Error('Cartella già utilizzata da un piano');
  if (existsSync(dir) || presentLink(dir)) throw Error('La destinazione deve essere una nuova cartella');
  return dir;
}
function presentLink(file: string) {
  try { return lstatSync(file).isSymbolicLink(); } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false; throw err; }
}
function git(dir: string, ...args: string[]) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore','pipe','pipe'] }).trim();
}
function available(floor: Floor, ctx: Ctx) {
  if (floor.workers.list().some(w => ['working','starting','needs_input'].includes(w.status) || w.worktree || w.repos?.length)
    || [...ctx.floors.values()].some(other => other !== floor && other.workers.list().some(w => w.repos?.some(r => r.floor === floor.id)))
    || floor.queue.state().tasks.some(t => t.status !== 'done') || floor.meetings.state().current?.status === 'running')
    throw Error('Concludere gli incarichi, le riunioni e le worktree attive prima di modificare il piano');
}
function validateClone(dir: string) {
  if (existsSync(path.join(dir, '.agent-office')) || presentLink(path.join(dir, '.agent-office')))
    throw Error('Il repository contiene la cartella riservata .agent-office');
}
function retainFailedWorkspace(dir: string) {
  const retained = path.join(path.dirname(dir), '.office-recovery-' + randomUUID());
  renameSync(dir, retained);
  return ' Copia locale conservata in ' + retained + '.';
}
async function selectRepo(ctx: Ctx, cfg: ForgeConfig, full: string, existing: boolean, currentId?: string): Promise<Repository> {
  if (ctx.building.list().some(f => f.id !== currentId && same(f.repo, full))) throw Error('Repository già associato a un piano');
  let repo: Repository | undefined = await forge(cfg, '/repos/' + full);
  if (existing) {
    if (!repo) throw Error('Repository privato non trovato');
  } else {
    if (repo) throw Error('Repository già esistente: scegliere «Collega esistente» oppure un altro nome');
    repo = await forge(cfg, '/orgs/' + cfg.organization + '/repos', 'POST', { name: full.split('/')[1], private: true, auto_init: true, default_branch: 'main' });
  }
  if (!repo?.private || !same(repo.full_name, full) || !Number.isSafeInteger(repo.id)) throw Error('È richiesto un repository privato valido');
  if (!existing) remember(ctx, cfg, repo);
  return repo;
}
function checkedName(input?: string) {
  if (typeof input !== 'string' || !input.trim() || input.length > 80 || /[\x00-\x1f]/.test(input)) throw Error('Inserire un nome piano valido (massimo 80 caratteri)');
  return input.trim();
}
async function create(ctx: Ctx, body: Input, who: string) {
  const cfg = config(), name = checkedName(body.name);
  const full = repoPath(cfg, body.repository?.trim() || officeRepoName(name));
  if (ctx.building.list().length + ctx.building.pending().length >= MAX_FLOORS) throw Error('Edificio pieno');
  mkdirSync(ctx.building.projectsDir, { recursive: true });
  const target = body.workspace?.trim() || full.split('/')[1] + '-' + randomUUID().slice(0,8);
  const dir = destination(ctx, target);
  const repo = await selectRepo(ctx, cfg, full, body.existing === true);
  const stage = mkdtempSync(path.join(path.dirname(dir), '.office-clone-'));
  let def: FloorDef | undefined;
  let installed = false;
  try {
    await cloneRepository(connections(), cfg.readerAccountId, full, stage);
    validateClone(stage);
    destination(ctx, dir);
    renameSync(stage, dir); installed = true;
    def = ctx.building.attach(dir, name, repo.full_name, who, repo.id);
    connections().bind({ dir, floorId: def.id, accountId: cfg.readerAccountId, repository: repo.full_name, agents: {} });
    if (!ctx.openFloor(def)) throw Error('Impossibile aprire il piano');
    ctx.floorsChanged();
    return { floorId: def.id };
  } catch (e) {
    if (def) { ctx.building.remove(def.id); connections().unbind(dir); }
    const retained = installed ? retainFailedWorkspace(dir) : '';
    throw Error((e as Error).message + '. Il repository è conservato: riprovare con «Collega esistente».' + retained);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

function current(ctx: Ctx, body: Input) {
  const def = ctx.building.list().find(f => f.id === body.floorId);
  if (!def || body.version !== version(def)) throw Error('Il piano è cambiato: aggiornare la schermata');
  return def;
}
async function update(ctx: Ctx, body: Input) {
  const old = current(ctx, body), floor = ctx.floors.get(old.id);
  if (!floor || ctx.building.isLocal(old.id)) throw Error('Il piano di avvio locale o non disponibile non può essere spostato');
  const name = checkedName(body.name), dir = destination(ctx, body.workspace?.trim() || old.dir, old.dir);
  const changingRepo = !!body.repository?.trim() && !same(body.repository.trim(), old.repo);
  const move = dir !== old.dir;
  const canMove = () => {
    if (move && floor.workers.list().some(w => !['exited','offline'].includes(w.status) && !w.paused))
      throw Error('Fermare le sessioni degli agenti di questo piano prima di spostare la cartella');
    if (move && existsSync(path.join(old.dir, '.git', 'worktrees'))) throw Error('Rimuovere prima le worktree Git collegate');
  };
  canMove();
  if (!move && !changingRepo && name === old.name) return { floorId: old.id };
  available(floor, ctx);
  const store = connections(), previous = store.binding(old.dir);
  let target: Repository | undefined, cfg: ForgeConfig | undefined, stage: string | undefined;
  if (changingRepo) {
    cfg = config();
    target = await selectRepo(ctx, cfg, repoPath(cfg, body.repository!.trim()), body.existing === true, old.id);
    await verifyGit(store, cfg.readerAccountId, target.full_name);
  }
  const next = { ...old, name, dir, ...(target && { repo: target.full_name, forgejoId: target.id }) };
  const identities = target ? floorIdentities(old.id) : [];
  let visitors: [string, Client][] = [];
  const returnVisitors = (opened: Floor) => {
    for (const [id, c] of visitors) if (ctx.clients.get(id) === c && c.peer.floor === LOBBY) ctx.goToFloor(c, opened);
  };
  let stopped = false, replaced = false, savedOrigin: string | undefined, installedGit = false;
  let installedCopy = false;
  const installedFiles: string[] = [];
  try {
    if (target && !existsSync(path.join(old.dir, '.git'))) {
      stage = mkdtempSync(path.join(ctx.building.projectsDir, '.office-import-'));
      await cloneRepository(store, cfg!.readerAccountId, target.full_name, stage);
      validateClone(stage);
      if (readdirSync(stage).some(file => existsSync(path.join(old.dir, file)) || presentLink(path.join(old.dir, file)))) throw Error('Il repository contiene nomi già presenti nel workspace. Spostare prima i file in conflitto.');
    }
    current(ctx, body); canMove();
    available(floor, ctx);
    if (move) destination(ctx, dir);
    for (const agent of identities) await retireForge(agent.id, true);
    visitors = [...ctx.clients].filter(([, c]) => c.peer.floor === old.id);
    for (const [, c] of visitors) ctx.toLobby(c);
    floor.shutdown(!move); ctx.floors.delete(old.id); stopped = true;
    if (move) {
      if (!lstatSync(old.dir).isDirectory()) throw Error('Workspace sorgente non valido');
      const copy = mkdtempSync(path.join(path.dirname(dir), '.office-move-'));
      try {
        const pty = path.join(old.dir, '.agent-office', 'pty.sock');
        await cp(old.dir, copy, { recursive: true, verbatimSymlinks: true, filter: src => src !== pty });
        destination(ctx, dir);
        renameSync(copy, dir); installedCopy = true;
      } finally { rmSync(copy, { recursive: true, force: true }); }
    }
    if (stage) {
      for (const file of readdirSync(stage)) {
        const out = path.join(dir, file);
        if (existsSync(out) || presentLink(out)) throw Error('Conflitto con un file locale');
        renameSync(path.join(stage, file), out); installedFiles.push(file);
      }
    } else if (target) {
      if (!lstatSync(path.join(dir, '.git')).isDirectory()) throw Error('Il checkout deve avere una directory Git indipendente');
      if (git(dir, 'remote').split('\n').includes('origin')) savedOrigin = git(dir, 'remote', 'get-url', 'origin');
      git(dir, 'remote', savedOrigin ? 'set-url' : 'add', 'origin', cfg!.url + '/' + target.full_name + '.git'); installedGit = true;
    }
    if (target || previous) store.bind({ dir, floorId: old.id, repository: target?.full_name ?? previous!.repository, accountId: cfg?.readerAccountId ?? previous!.accountId,
      agents: previous?.agents ?? {} });
    ctx.building.replace(next); replaced = true;
    const opened = ctx.openFloor(next);
    if (!opened) throw Error('Il nuovo workspace non si apre');
    if (move && previous) store.unbind(old.dir);
    ctx.floorsChanged();
    returnVisitors(opened);
    for (const agent of identities) await assignForge(agent.id, next, agent);
    return { floorId: old.id, ...(move && { retained: old.dir }) };
  } catch (error) {
    if (stopped) {
      ctx.floors.get(old.id)?.shutdown(true); ctx.floors.delete(old.id);
      if (replaced) ctx.building.replace(old);
      if (move) store.unbind(dir);
      if (previous) store.bind(previous); else store.unbind(old.dir);
      if (!move && installedGit) {
        if (savedOrigin) git(dir, 'remote', 'set-url', 'origin', savedOrigin);
        else git(dir, 'remote', 'remove', 'origin');
      }
      if (!move && stage) for (const file of installedFiles) renameSync(path.join(dir, file), path.join(stage, file));
      const opened = ctx.openFloor(old); ctx.floorsChanged();
      if (opened) returnVisitors(opened);
    }
    for (const agent of identities) await assignForge(agent.id, old, agent);
    if (installedCopy) throw Error((error as Error).message + '.' + retainFailedWorkspace(dir));
    throw error;
  } finally { if (stage) rmSync(stage, { recursive: true, force: true }); }
}
async function remove(ctx: Ctx, body: Input, who: string) {
  const def = current(ctx, body);
  if (typeof body.deleteRemote !== 'boolean') throw Error('Scegliere se conservare il repository');
  if (body.deleteRemote) {
    const cfg = config();
    if (!def.repo || !def.forgejoId || body.confirmation !== def.repo || ownership(ctx)[key(cfg, def.repo)] !== def.forgejoId)
      throw Error('Confermare il nome completo di un repository creato da Office');
    if (ctx.building.list().some(f => f.id !== def.id && same(f.repo, def.repo))) throw Error('Repository utilizzato da un altro piano');
    const repo: Repository | undefined = await forge(cfg, '/repos/' + repoPath(cfg, def.repo));
    if (repo && (repo.id !== def.forgejoId || !repo.private || !same(repo.full_name, def.repo))) throw Error('Identità del repository cambiata');
    for (const agent of floorIdentities(def.id)) await retireForge(agent.id);
    if (repo) await forge(cfg, '/repos/' + def.repo, 'DELETE');
  }
  if (!body.deleteRemote) for (const agent of floorIdentities(def.id)) await retireForge(agent.id);
  const removed = ctx.building.remove(def.id, who);
  if (typeof removed === 'string') throw Error(removed);
  const floor = ctx.floors.get(def.id);
  if (floor) ctx.closeFloor(floor, who);
  connections().unbind(def.dir);
  ctx.floorsChanged();
  return { ok: true, retained: def.dir };
}
export function changeFloor(ctx: Ctx, action: 'floor-create' | 'floor-update' | 'floor-delete', body: Input, who: string) {
  return serializeForge(async () => {
    if (action === 'floor-create') return create(ctx, body, who);
    if (action === 'floor-update') return update(ctx, body);
    return remove(ctx, body, who);
  });
}
