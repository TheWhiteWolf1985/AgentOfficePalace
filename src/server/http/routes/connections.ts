import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { mkdtemp, mkdir, rmdir } from 'node:fs/promises';
import { TLSSocket } from 'node:tls';
import { deviceState, dockerRoot, loginContainer, serialWorker } from '../../workers/docker.js';
import { codexAccounts } from '../../workers/docker-accounts.js';
import { agentAssignment } from '../../../shared/forgejo-agent.js';
import { forgeView, assignForge, serializeForge } from '../../forgejo-agents.js';
import { changeFloor, floorManagement, hasFloorForge } from '../../managed-floors.js';
import { DESKS } from '../../../shared/layout.js';
import { connections, repositoryName, checkedId } from '../../connections/store.js';
import { RemoteApi } from '../../connections/api.js';
import { verifyGit, cloneRepository } from '../../connections/git.js';
import { startGithubLogin, githubLoginState, cancelGithubLogin } from '../../connections/login.js';
import type { GitBinding } from '../../../shared/connections.js';
import { DESK_BY_ID, deskBuilt } from '../../../shared/layout.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';
import type { AgentProvider } from '../../../shared/protocol.js';

/** An installation may limit management to the engines it supports. */
export function managedProviders(available: AgentProvider[]): AgentProvider[] {
  const configured = process.env.AGENT_OFFICE_MANAGED_PROVIDERS;
  return configured ? available.filter((p) => configured.split(',').map((s) => s.trim()).includes(p)) : available;
}

export const connectionsRoute: Route = {
  path: '/api/connections', auth: 'session',
  async handle(ctx, { req, res, session, url }) {
    if (!ctx.meOf(session.account?.id).admin) return send(res, 403, { error: 'Solo gli amministratori possono gestire i collegamenti' });
    if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'Metodo non consentito' });
    if (req.method === 'POST' && !sameOrigin(req, ctx.cfg)) return send(res, 403, { error: 'Origine della richiesta non valida' });
    const store = connections();
    try {
      if (req.method === 'GET') {
        if (url.searchParams.has('floor-management')) return send(res, 200, floorManagement(ctx));
        if (url.searchParams.has('login')) return send(res, 200, await githubLoginState(checkedId(url.searchParams.get('login'))));
        const floors = [...ctx.floors.values()].map(f => ({ id: f.id, name: f.def.name, dir: f.def.dir,
          project: { ...f.project, agentProviders: managedProviders(f.project.agentProviders) }, workers: f.workers.list() }));
        const accounts = url.searchParams.has('agents') && dockerRoot()
          ? await codexAccounts(floors.flatMap(f => f.workers.filter(w => w.runtime === 'docker').map(w => w.id))) : undefined;
        const forgeAccounts = accounts && Object.fromEntries(floors.flatMap(f => f.workers.filter(w => w.runtime === 'docker').map(w => [w.id,forgeView(w.id)])));
        return send(res, 200, { ...store.snapshot(), admin: true, codexDocker: !!dockerRoot(), floors, codexAccounts: accounts, forgeAccounts });
      }
      const body = JSON.parse(await readBody(req, 65536));
      switch (body.action) {
        case 'floor-create':
        case 'floor-update':
        case 'floor-delete':
          return send(res, 200, await changeFloor(ctx, body.action, body, session.account?.name ?? 'admin'));
        case 'server': return send(res, 200, store.putServer(body));
        case 'account': return send(res, 200, store.putAccount(body));
        case 'remove': {
          if (body.kind !== 'server' && [...ctx.floors.values()].some((f) => f.workers.list().some((w) => w.connectionAccountId === body.id && w.status !== 'exited' && w.status !== 'offline'))) throw Error('Account ancora in uso in una sessione: riavviare prima gli agenti con la nuova assegnazione');
          store.remove(body.kind === 'server' ? 'server' : 'account', checkedId(body.id)); return send(res, 200, { ok: true });
        }
        case 'verify': return send(res, 200, { username: await new RemoteApi(store, checkedId(body.accountId)).verify() });
        case 'repositories': return send(res, 200, { repositories: await new RemoteApi(store, checkedId(body.accountId)).repositories() });
        case 'git': return send(res, 200, await verifyGit(store, checkedId(body.accountId), repositoryName(body.repository)));
        case 'login': return send(res, 200, startGithubLogin(checkedId(body.serverId), String(body.name ?? '')));
        case 'cancel-login': cancelGithubLogin(checkedId(body.flow)); return send(res, 200, { ok: true });
        case 'container-office': {
          if (hasFloorForge()) return send(res, 200, await changeFloor(ctx, 'floor-create', body, session.account?.name ?? 'admin'));
          if (!dockerRoot()) throw Error('Docker non configurato');
          const name = String(body.name ?? '').trim();
          if (!name || name.length > 80 || /[\x00-\x1f]/.test(name)) throw Error('Nome ufficio non valido');
          const root = ctx.building.projectsDir;
          await mkdir(root, { recursive: true });
          const dir = await mkdtemp(path.join(root, 'office-'));
          let def;
          try { def = ctx.building.attach(dir, name, '', session.account?.name ?? 'admin'); }
          catch (error) { await rmdir(dir); throw error; }
          if (!ctx.openFloor(def)) throw Error('Ufficio creato ma apertura non riuscita');
          ctx.floorsChanged();
          return send(res, 200, { floorId: def.id });
        }
        case 'container-create': {
          if (!dockerRoot()) throw Error('Docker non configurato');
          const floor = ctx.floors.get(checkedId(body.floorId));
          if (!floor) throw Error('Ufficio non trovato');
          const desk = DESKS.find(d => !d.station && !d.room && !floor.workers.deskOccupied(d.id));
          if (!desk) throw Error('Nessuna scrivania libera');
          if (body.prompt !== undefined && (typeof body.prompt !== 'string' || body.prompt.length > 20000)) throw Error('Istruzioni non valide');
          const assignment = agentAssignment(body.assignment ?? {tenure:'temporary',role:'operator'});
          const r = floor.workers.spawn(desk.id, session.account?.name ?? 'admin', body.prompt, false, 'agent', 'codex', body.model, body.effort, undefined, session.account?.id, [], body.appearance);
          if (typeof r === 'string') throw Error(r);
          const access = await serializeForge(async () => {
            if (ctx.floors.get(floor.id) !== floor || !floor.workers.get(r.id)) throw Error('Ufficio o agente non disponibile');
            return assignForge(r.id,floor.def,assignment);
          });
          return send(res, 201, { workerId: r.id, access });
        }
        case 'agent-forge': {
          const id = checkedId(body.workerId), floorId = checkedId(body.floorId), assignment = agentAssignment(body.assignment);
          const access = await serializeForge(async () => {
            const floor = ctx.floors.get(floorId);
            if (!floor || floor.workers.get(id)?.runtime !== 'docker') throw Error('Agente Docker non trovato');
            return assignForge(id,floor.def,assignment);
          });
          return send(res,200,{access});
        }
        case 'container': {
          const floor = ctx.floors.get(checkedId(body.floorId)), id = checkedId(body.workerId);
          if (!floor || floor.workers.get(id)?.runtime !== 'docker') throw Error('Agente Docker non trovato');
          const owner = session.account?.id ?? 'shared-admin';
          switch (body.operation) {
            case 'start': {
              const error = floor.workers.resume(id); if (error) throw Error(error);
              break;
            }
            case 'stop': await floor.workers.pauseContainer(id); break;
            case 'remove': {
              const result = await floor.sendHome(id);
              if (result.error) throw Error(result.error);
              return send(res, 200, { ok: true, note: result.note });
            }
            case 'login-state': return send(res, 200, deviceState(id, owner));
            case 'login-device':
            case 'login-key': {
              if (!(req.socket instanceof TLSSocket && req.socket.encrypted) && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) throw Error('Apri il sito tramite HTTPS per collegare Codex');
              if (body.operation === 'login-key' && typeof body.apiKey !== 'string') throw Error('Chiave API richiesta');
              return send(res, 200, await serialWorker(id, () => loginContainer(id, owner, body.operation === 'login-key' ? body.apiKey : undefined)));
            }
            default: throw Error('Operazione non valida');
          }
          return send(res, 200, { ok: true });
        }
        case 'worker': {
          const floor = ctx.floors.get(checkedId(body.floorId));
          if (!floor || !floor.workers.get(checkedId(body.workerId))) throw Error('Agente non trovato');
          const desk = DESK_BY_ID.get(body.configuration?.deskId);
          if (!desk || !deskBuilt(desk, floor.workers.wing())) throw Error('La scrivania non e disponibile su questo piano');
          if (body.configuration?.provider && !managedProviders(floor.project.agentProviders).includes(body.configuration.provider)) throw Error('Provider non disponibile su questo server');
          await floor.workers.configure(body.workerId, body.configuration);
          return send(res, 200, { ok: true, worker: floor.workers.get(body.workerId) });
        }
        case 'bind': {
          const floor = ctx.floors.get(checkedId(body.floorId));
          if (!floor) throw Error('Ufficio non trovato');
          const repository = repositoryName(body.repository), accountId = checkedId(body.accountId);
          const server = store.server(store.account(accountId).serverId);
          const origin = execFileSync('git', ['-C', floor.def.dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 5000 }).trim();
          const normalized = origin.replace(/^git@([^:]+):/, 'ssh://git@$1/').replace(/\.git$/, '');
          const remote = new URL(normalized);
          if (remote.hostname !== new URL(server.url).hostname || !remote.pathname.endsWith('/' + repository) || (remote.protocol !== 'ssh:' && normalized !== server.url + '/' + repository)) throw Error('La repository scelta non coincide con il checkout dell’ufficio');
          await verifyGit(store, accountId, repository);
          const binding: GitBinding = { dir: floor.def.dir, floorId: floor.id, repository, accountId, agents: body.agents ?? {} };
          const workerIds = new Set(floor.workers.list().map((w) => w.id));
          for (const workerId of Object.keys(binding.agents)) if (!workerIds.has(workerId)) throw Error('Agente non presente nell’ufficio');
          for (const agentAccount of new Set(Object.values(binding.agents).map((a) => a.accountId).filter((s): s is string => !!s))) await new RemoteApi(store, agentAccount).repository(repository);
          const saved = store.bind(binding);
          await floor.github.refresh();
          return send(res, 200, saved);
        }
        case 'office': {
          const repository = repositoryName(body.repository), accountId = checkedId(body.accountId);
          const account = store.account(accountId);
          const destination = path.join(ctx.building.projectsDir, account.serverId, ...repository.split('/'));
          if (ctx.building.list().some((f) => path.resolve(f.dir) === destination)) throw Error('Questa repository ha gia un ufficio');
          await cloneRepository(store, accountId, repository, destination);
          const def = ctx.building.attach(destination, String(body.name ?? '').trim() || repository.split('/')[1], repository, session.account?.name ?? 'amministratore');
          store.bind({ dir: def.dir, floorId: def.id, accountId, repository, agents: {} });
          if (!ctx.openFloor(def)) throw Error('Repository clonata ma ufficio non aperto: consultare il log');
          ctx.floorsChanged();
          return send(res, 200, { floorId: def.id });
        }
        default: return send(res, 400, { error: 'Operazione non riconosciuta' });
      }
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Operazione non riuscita' }); }
  },
};
