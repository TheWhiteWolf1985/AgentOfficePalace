import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { Building, type FloorDef } from '../../src/server/building.js';
import { connections } from '../../src/server/connections/store.js';
import { changeFloor, floorManagement } from '../../src/server/managed-floors.js';
import type { Ctx } from '../../src/server/office/context.js';

export function git(dir: string, ...args: string[]) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Real checkouts, registry and bindings. Only the Forgejo service and live office sessions are simulated. */
export async function testOffice(t: TestContext) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'office-floor-'));
  const data = path.join(temp, 'data'), root = path.join(temp, 'projects'), seed = path.join(temp, 'seed');
  for (const dir of [data, root, seed]) mkdirSync(dir);
  const repos = new Map<string, { full_name: string; private: boolean; id: number }>();
  let nextId = 1;
  const addRepo = (full_name: string, privateRepo = true) => {
    const repo = { full_name, private: privateRepo, id: nextId++ };
    repos.set(full_name, repo);
    return repo;
  };
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const faults = { deleteStatus: 0, gitUnavailable: false, failNextOpen: false };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost').pathname;
    if (url.startsWith('/api/v1/')) {
      let text = '';
      for await (const chunk of req) text += chunk;
      const method = req.method!, body = text ? JSON.parse(text) : undefined;
      calls.push({ method, url, body });
      const write = method !== 'GET';
      if (req.headers.authorization !== 'token writer' && (write || req.headers.authorization !== 'token reader')) {
        res.writeHead(403).end(); return;
      }
      if (url === '/api/v1/orgs/uffici/repos' && method === 'POST') {
        const full = 'uffici/' + body.name;
        if (repos.has(full)) { res.writeHead(409).end(); return; }
        res.writeHead(201).end(JSON.stringify(addRepo(full, body.private))); return;
      }
      const full = url.slice('/api/v1/repos/'.length);
      if (!repos.has(full)) { res.writeHead(404).end(); return; }
      if (method === 'DELETE') {
        if (faults.deleteStatus) { res.writeHead(faults.deleteStatus).end(); return; }
        repos.delete(full);
        res.writeHead(204).end(); return;
      }
      res.end(JSON.stringify(repos.get(full))); return;
    }
    // Git's read-only HTTP transport serves HEAD, refs and objects from a real fixture repository.
    const part = /^\/(uffici\/[\w.-]+)\.git\/(HEAD|info\/refs|objects\/[\w/-]+)$/.exec(url);
    if (!part || !repos.has(part[1]) || faults.gitUnavailable) { res.writeHead(404).end(); return; }
    const file = path.join(seed, '.git', part[2]);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.end(readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const env = { AGENT_OFFICE_FLOOR_FORGEJO: path.join(data, 'forge.json'), AGENT_OFFICE_CONNECTIONS_DIR: path.join(data, 'connections') };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(temp, { recursive: true, force: true });
  });
  function seedGit(reserved = false) {
    git(seed, 'init', '-b', 'main');
    writeFileSync(path.join(seed, 'README.md'), 'seed document\n');
    if (reserved) {
      mkdirSync(path.join(seed, '.agent-office'));
      writeFileSync(path.join(seed, '.agent-office', 'state'), 'reserved');
    }
    git(seed, 'add', '.');
    git(seed, '-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'seed');
    git(seed, 'update-server-info');
  }
  const store = connections(), serverId = store.putServer({ provider: 'forgejo', name: 'local', url }).id;
  const reader = store.putAccount({ serverId, name: 'test', token: 'reader' });
  store.verification(reader.id, 'test');
  writeFileSync(env.AGENT_OFFICE_FLOOR_FORGEJO, JSON.stringify({ url, organization: 'uffici', readerAccountId: reader.id, token: 'writer' }));
  const building = new Building(data, root);
  const workers: { status: string; paused?: boolean; worktree?: string; repos?: { floor: string }[] }[] = [];
  const tasks: { status: string }[] = [];
  const meeting = { status: 'done' };
  function live(def: FloorDef) {
    return { id: def.id, def, shutdown() {}, workers: { list: () => workers }, queue: { state: () => ({ tasks }) }, meetings: { state: () => ({ current: meeting }) } };
  }
  const floors = new Map<string, ReturnType<typeof live>>();
  const clients = new Map<string, { peer: { floor: string } }>();
  function openFloor(def: FloorDef) {
    if (faults.failNextOpen) { faults.failNextOpen = false; return; }
    const floor = live(def); floors.set(def.id, floor); return floor;
  }
  const ctx = { cfg: { dataDir: data }, building, floors, clients, floorsChanged() {}, openFloor,
    toLobby(c: { peer: { floor: string } }) { c.peer.floor = '@lobby'; },
    goToFloor(c: { peer: { floor: string } }, floor: { id: string }) { c.peer.floor = floor.id; },
    closeFloor(floor: { id: string }) { floors.delete(floor.id); } } as unknown as Ctx;
  function legacy() {
    const dir = path.join(root, 'legacy'); mkdirSync(dir);
    const def = building.attach(dir, 'Legacy', '', 'admin');
    openFloor(def); return def;
  }
  type Input = Parameters<typeof changeFloor>[2];
  const create = (input: Input = {}) => changeFloor(ctx, 'floor-create', { name: 'Ufficio test', workspace: 'office', ...input }, 'admin');
  const view = (id = building.list()[0].id) => floorManagement(ctx).floors.find(f => f.id === id)!;
  const update = (input: Input) => { const floor = view(); return changeFloor(ctx, 'floor-update', { floorId: floor.id, name: floor.name, version: floor.version, ...input }, 'admin'); };
  const remove = (input: Input) => { const floor = view(); return changeFloor(ctx, 'floor-delete', { floorId: floor.id, version: floor.version, ...input }, 'admin'); };
  return { ctx, create, update, remove, view, legacy, seedGit, repos, addRepo, calls, faults, root, data, building, store, reader, url, clients, workers, tasks, meeting };
}
