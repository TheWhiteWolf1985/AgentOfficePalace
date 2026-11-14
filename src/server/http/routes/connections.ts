import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { connections, repositoryName, checkedId } from '../../connections/store.js';
import { RemoteApi } from '../../connections/api.js';
import { verifyGit, cloneRepository } from '../../connections/git.js';
import { startGithubLogin, githubLoginState, cancelGithubLogin } from '../../connections/login.js';
import type { GitBinding } from '../../../shared/connections.js';
import { DESK_BY_ID, deskBuilt } from '../../../shared/layout.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';
import type { AgentProvider } from '../../../shared/protocol.js';

/** A deployment may offer only engines its isolated runner actually supports. */
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
        if (url.searchParams.has('login')) return send(res, 200, await githubLoginState(checkedId(url.searchParams.get('login'))));
        return send(res, 200, { ...store.snapshot(), admin: true, floors: [...ctx.floors.values()].map((f) => ({ id: f.id, name: f.def.name, dir: f.def.dir, project: { ...f.project, agentProviders: managedProviders(f.project.agentProviders) }, workers: f.workers.list() })) });
      }
      const body = JSON.parse(await readBody(req, 65536));
      switch (body.action) {
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
        case 'worker': {
          const floor = ctx.floors.get(checkedId(body.floorId));
          if (!floor || !floor.workers.get(checkedId(body.workerId))) throw Error('Agente non trovato');
          const desk = DESK_BY_ID.get(body.configuration?.deskId);
          if (!desk || !deskBuilt(desk, floor.workers.wing())) throw Error('La scrivania non e disponibile su questo piano');
          if (body.configuration?.provider && !managedProviders(floor.project.agentProviders).includes(body.configuration.provider)) throw Error('Provider non disponibile su questo server');
          await floor.workers.configure(body.workerId, body.configuration);
          return send(res, 200, { ok: true });
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
          const old = store.binding(floor.def.dir);
          if (old?.controlled && floor.github.pulls.items.some((p) => p.state === 'OPEN') && ['capoanalista', 'capoeditore'].some((role) => body.roles?.[role] !== old.roles[role as 'capoanalista' | 'capoeditore'])) throw Error('Completare le PR documentali aperte prima di cambiare le identita dei revisori');
          const binding: GitBinding = { dir: floor.def.dir, floorId: floor.id, repository, accountId, controlled: old?.controlled ?? false, roles: body.roles ?? {}, agents: body.agents ?? {} };
          const workerIds = new Set(floor.workers.list().map((w) => w.id));
          for (const workerId of Object.keys(binding.agents)) if (!workerIds.has(workerId)) throw Error('Agente non presente nell’ufficio');
          for (const roleId of new Set([...Object.values(binding.roles), ...Object.values(binding.agents).map((a) => a.accountId)].filter((s): s is string => !!s))) await new RemoteApi(store, roleId).repository(repository);
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
          store.bind({ dir: def.dir, floorId: def.id, accountId, repository, controlled: false, roles: { lettura: accountId }, agents: {} });
          if (!ctx.openFloor(def)) throw Error('Repository clonata ma ufficio non aperto: consultare il log');
          ctx.floorsChanged();
          return send(res, 200, { floorId: def.id });
        }
        default: return send(res, 400, { error: 'Operazione non riconosciuta' });
      }
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Operazione non riuscita' }); }
  },
};
