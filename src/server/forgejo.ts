
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { GhPull, GhPullDetail, GhComment } from '../shared/protocol.js';
import { connections } from './connections/store.js';

type FRepo = { base: string; path: string; token: string; analista?: string; editore?: string };
async function forgejoRepo(dir: string): Promise<FRepo | undefined> {
  const store = connections(), selected = store.selected(dir);
  if (selected) {
    if (selected.server.provider !== 'forgejo') return undefined;
    const role = (name: 'capoanalista' | 'capoeditore') => selected.binding.roles[name] ? store.account(selected.binding.roles[name]!).username : undefined;
    return { base: selected.server.url, path: '/api/v1/repos/' + selected.binding.repository.split('/').map(encodeURIComponent).join('/'), token: store.token(selected.account.id), analista: role('capoanalista'), editore: role('capoeditore') };
  }
  let remote: string;
  try { remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 5000 }).trim(); }
  catch { return undefined; }
  const base = process.env.AGENT_OFFICE_FORGEJO_URL ?? 'http://192.168.1.76:3000';
  const parsed = /^(?:ssh:\/\/git@|https?:\/\/)([^/:]+)(?::\d+)?\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote);
  if (!parsed || parsed[1] !== new URL(base).hostname) return undefined;
  const tokenFile = process.env.AGENT_OFFICE_FORGEJO_TOKEN_FILE ?? '/data/home/.config/forgejo/office-read-token';
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!token) throw new Error('Forgejo read-only credential unavailable');
  return { base, path: '/api/v1/repos/' + encodeURIComponent(parsed[2]) + '/' + encodeURIComponent(parsed[3]), token };
}
async function get(r: FRepo, suffix: string, text = false): Promise<any> {
  const res = await fetch(r.base + r.path + suffix, { headers: { Authorization: 'token ' + r.token }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!res.ok) throw new Error('Forgejo request failed (HTTP ' + res.status + ')');
  return text ? res.text() : res.json();
}
function state(p: any): string { return p.merged ? 'MERGED' : String(p.state ?? '').toUpperCase(); }
function comment(c: any): GhComment { return { id: String(c.id), author: c.user?.login ?? '', body: String(c.body ?? ''), createdAt: c.created_at ?? c.submitted_at ?? '', url: c.html_url, state: c.state }; }
export async function forgejoList(dir: string): Promise<GhPull[] | undefined> {
  const r = await forgejoRepo(dir);
  if (!r) return undefined;
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const items = await get(r, '/pulls?state=all&limit=50&page=' + page);
    if (!Array.isArray(items)) throw new Error('Forgejo returned an invalid pull request list');
    all.push(...items);
    if (items.length < 50) break;
    if (page === 10) throw new Error('Forgejo pull request list exceeds 500; pagination required');
  }
  const result: GhPull[] = [];
  for (let i = 0; i < all.length; i += 8) {
    const batch = await Promise.all(all.slice(i, i + 8).map(async (p: any) => {
      let decision = '';
      if (state(p) === 'OPEN' && !p.draft) {
        try {
          const reviews = await get(r, '/pulls/' + p.number + '/reviews?limit=50');
          if (Array.isArray(reviews) && reviews.length < 50) {
            const gate = spawnSync('python3', ['-B', '/opt/maros-pipeline/gate_revisioni.py'], {
              input: JSON.stringify({head: p.head?.sha, reviews, analista: r.analista, editore: r.editore}), encoding: 'utf8', timeout: 5000, maxBuffer: 65536,
            });
            if (gate.status === 0 && JSON.parse(gate.stdout).verde === true) decision = 'APPROVED';
          }
        } catch { /* fail closed: display as in review */ }
      }
      return ({
    readOnly: true, number: p.number, title: String(p.title ?? ''), state: state(p), isDraft: !!p.draft || /^WIP:/i.test(p.title ?? ''),
    url: p.html_url ?? '', author: p.user?.login ?? '', labels: (p.labels ?? []).map((l: any) => ({ name: l.name, color: l.color ?? '888888' })),
    reviewDecision: decision, headRefName: p.head?.ref ?? '', headRefOid: p.head?.sha, baseRefName: p.base?.ref ?? '',
    createdAt: p.created_at ?? '', updatedAt: p.updated_at ?? '', additions: p.additions ?? 0, deletions: p.deletions ?? 0,
    checks: 'none' as const, body: String(p.body ?? '').slice(0, 4000), closes: [],
  });
    }));
    result.push(...batch);
  }
  return result;
}
export async function forgejoDetail(dir: string, n: number): Promise<GhPullDetail | undefined> {
  const r = await forgejoRepo(dir);
  if (!r) return undefined;
  const [p, comments, reviews, commits] = await Promise.all([get(r, '/pulls/' + n), get(r, '/issues/' + n + '/comments?limit=50'), get(r, '/pulls/' + n + '/reviews?limit=50'), get(r, '/pulls/' + n + '/commits?limit=50')]);
  if (!Array.isArray(comments) || !Array.isArray(reviews)) throw new Error('Forgejo returned invalid review data');
  let gateRevisioni = { verde: false, motivo: 'Impossibile verificare le revisioni' };
  if (reviews.length >= 50) {
    gateRevisioni.motivo = 'Troppe revisioni: necessario leggere tutte le pagine';
  } else {
    const evaluated = spawnSync('python3', ['-B', '/opt/maros-pipeline/gate_revisioni.py'], {
      input: JSON.stringify({ head: p.head?.sha, reviews, analista: r.analista, editore: r.editore }), encoding: 'utf8', timeout: 5000,
      maxBuffer: 65536,
    });
    if (evaluated.status === 0) {
      try {
        const data = JSON.parse(evaluated.stdout);
        if (typeof data.verde === 'boolean' && typeof data.motivo === 'string') gateRevisioni = data;
      } catch { /* fail closed */ }
    }
  }
  return { gateRevisioni, headCommit: p.head?.sha, number: p.number, body: String(p.body ?? ''), state: state(p), isDraft: !!p.draft || /^WIP:/i.test(p.title ?? ''),
    reviewDecision: '', headRefName: p.head?.ref ?? '', baseRefName: p.base?.ref ?? '', mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN',
    commits: commits.length, comments: comments.map(comment), reviews: reviews.map(comment), reviewComments: [], checks: [],
    repo: { nameWithOwner: r.path.split('/').slice(-2).join('/'), methods: [] }, viewer: 'ufficiolettura' };
}
export async function forgejoDiff(dir: string, n: number): Promise<string | undefined> {
  const r = await forgejoRepo(dir);
  if (!r) return undefined;
  return get(r, '/pulls/' + n + '.diff', true);
}

/** Requests a guarded merge through the separate service; Forgejo credentials stay outside the office and workers. */
export async function forgejoMerge(dir: string, n: number, head: string | undefined, method: string, deleteBranch: boolean, auto: boolean): Promise<{handled: boolean; error?: string}> {
  const r = await forgejoRepo(dir);
  if (!r) return {handled: false};
  if (auto || method !== 'merge' || !deleteBranch) return {handled: true, error: 'Forgejo richiede merge normale e cancellazione del branch'};
  if (!head || !/^[0-9a-fA-F]{40}$/.test(head)) return {handled: true, error: 'Commit non disponibile: aggiorna la PR'};
  try {
    const secret = (await readFile('/run/maros-gateway/secret', 'utf8')).trim();
    if (!secret) throw new Error('Credenziale del servizio merge non disponibile');
    const repo = r.path.split('/').slice(-2).map(decodeURIComponent).join('/');
    const response = await fetch(process.env.MAROS_MERGE_URL ?? 'http://maros-merge:8787/merge', {
      method: 'POST', headers: {Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json'},
      body: JSON.stringify({repo, number: n, head}), signal: AbortSignal.timeout(300000), redirect: 'error',
    });
    const data = await response.json() as {error?: string; merged?: boolean; branch_deleted?: boolean; vault_synced?: boolean; message?: string};
    if (!response.ok) return {handled: true, error: data.error ?? 'Controllo merge non riuscito'};
    if (!data.merged) return {handled: true, error: 'Merge non confermato'};
    if (!data.branch_deleted) return {handled: true, error: data.message ?? 'Merge eseguito, eliminazione branch non confermata'};
    if (!data.vault_synced) return {handled: true, error: data.message ?? 'Merge eseguito, sincronizzazione vault non confermata'};
    return {handled: true};
  } catch (e) {
    return {handled: true, error: 'Servizio merge non disponibile: ' + (e as Error).message};
  }
}
