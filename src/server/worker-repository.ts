import http from 'node:http';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import type { FloorDef } from './building.js';
import { readBody, send } from './http/util.js';
import { ForgejoMergePending, workerForge } from './forgejo-agents.js';

async function approvedHead(remote: ReturnType<typeof workerForge>, number: number, sha: string) {
  for (let page = 1; ; page++) {
    const reviews: { official: boolean; dismissed: boolean; stale: boolean; state: string; commit_id: string }[] =
      await remote.api('/pulls/' + number + '/reviews?limit=50&page=' + page);
    if (reviews.some(r => r.official && !r.dismissed && !r.stale && r.state === 'APPROVED' && r.commit_id === sha)) return true;
    if (!reviews.length) return false;
  }
}
export async function repositoryOperation(id: string, floor: FloorDef, input: Record<string,unknown>) {
  const remote = workerForge(id, floor);
  const { operation } = input;
  if (operation === 'info') return { login: remote.login, repository: remote.full, role: remote.role,
    defaultBranch: (await remote.api('')).default_branch, remote: 'http://127.0.0.1:19462/office.git' };
  const number = input.number;
  if (operation !== 'open' && (!Number.isSafeInteger(number) || Number(number) < 1)) throw Error('Numero PR non valido');
  if (operation === 'read') {
    const pr = await remote.api('/pulls/' + number);
    return { number, title: pr.title, head: pr.head.sha, state: pr.state, merged: pr.merged, url: pr.html_url };
  }
  if (remote.role === 'operator') throw Error('Il ruolo Operatore può leggere e scrivere sui branch di lavoro');
  if (operation === 'open') {
    if (typeof input.head !== 'string' || !input.head || input.head.length > 255 || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255)
      throw Error('Indicare branch e titolo della PR');
    const repo = await remote.api('');
    const pr = await remote.api('/pulls', 'POST', { title: input.title, head: input.head, base: repo.default_branch, body: String(input.body ?? '').slice(0,16000) });
    return { number:pr.number, head:pr.head.sha, url:pr.html_url };
  }
  if (typeof input.sha !== 'string' || !/^[a-f0-9]{40,64}$/.test(input.sha)) throw Error('Specificare il commit esatto della revisione');
  if (operation === 'merge' && remote.role !== 'chief') throw Error('Il merge è riservato al Capo ufficio');
  const route = '/pulls/' + number;
  for (let attempt = 0; ; attempt++) {
    const pr = await remote.api(route);
    if (pr.state !== 'open' || pr.head.sha !== input.sha) throw Error('La revisione della PR è cambiata');
    if (operation === 'approve' || operation === 'reject') {
      await remote.api(route + '/reviews', 'POST', { event: operation === 'approve' ? 'APPROVED' : 'REQUEST_CHANGES',
        commit_id: input.sha, body: String(input.body ?? '').slice(0,16000) });
      break;
    }
    if (operation !== 'merge') throw Error('Operazione Forgejo non valida');
    if (!await approvedHead(remote, Number(number), input.sha)) throw Error('Serve una revisione approvata sul commit corrente');
    try {
      await remote.api(route + '/merge', 'POST', { Do:'merge', head_commit_id:input.sha });
      break;
    } catch (error) {
      // Only Forgejo's explicit "try again later" can be retried. Recheck the head and approvals after the delay.
      if (!(error instanceof ForgejoMergePending) || attempt >= 6) throw error;
      await delay(Math.min(250 * 2 ** attempt, 2000));
    }
  }
  return { number, head: input.sha, operation };
}
export async function workerRepository(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string, floor: FloorDef) {
  try {
    if (url.pathname === '/office/workers/repository' && req.method === 'POST')
      return send(res,200,await repositoryOperation(id,floor,JSON.parse(await readBody(req,32768))));
    const service = url.searchParams.get('service');
    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') return send(res,400,{error:'Servizio Git non valido'});
    const discover = req.method === 'GET';
    if (!discover && req.method !== 'POST') return send(res,405,{});
    const forge = workerForge(id,floor);
    const target = new URL(forge.url + '/' + forge.full + '.git/' + (discover ? 'info/refs?service=' + service : service));
    const headers: http.OutgoingHttpHeaders = { authorization: forge.gitAuth };
    if (!discover) headers['content-type'] = 'application/x-' + service + '-request';
    if (req.headers['git-protocol'] === 'version=2') headers['git-protocol'] = 'version=2';
    if (req.headers['content-encoding'] === 'gzip') headers['content-encoding'] = 'gzip';
    const upstream = (target.protocol === 'https:' ? https : http).request(target, { method:req.method, headers }, reply => {
      if (reply.statusCode !== 200) { reply.resume(); return send(res,reply.statusCode === 404 ? 404 : 403,{error:'Operazione Git rifiutata'}); }
      res.writeHead(200,{'content-type': String(reply.headers['content-type']), 'cache-control':'no-store'});
      reply.on('error', () => res.destroy()); reply.pipe(res);
    });
    upstream.setTimeout(90000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent && !res.destroyed) send(res,502,{error:'Forgejo non disponibile'}); else res.destroy(); });
    res.once('close', () => upstream.destroy());
    req.pipe(upstream);
  } catch (error) { send(res,403,{error:(error as Error).message}); }
}
