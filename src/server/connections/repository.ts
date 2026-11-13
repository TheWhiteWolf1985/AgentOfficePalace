import { readFile } from 'node:fs/promises';
import type { GhIssue, GhPull, GhIssueDetail, GhPullDetail, GhComment, GhLabel } from '../../shared/protocol.js';
import { connections } from './store.js';
import { RemoteApi } from './api.js';

const state = (item: any) => item.merged || item.merged_at ? 'MERGED' : String(item.state ?? '').toUpperCase();
const labels = (items: any[] = []): GhLabel[] => items.map((l) => ({ name: l.name, color: l.color ?? '888888', description: l.description }));
const comment = (c: any): GhComment => ({ id: String(c.id), author: c.user?.login ?? '', body: String(c.body ?? ''), createdAt: c.created_at ?? c.submitted_at ?? '', url: c.html_url, state: c.state });

/** A binding selects exactly one identity. A failed binding never falls back to another login. */
export function connectedRepository(dir: string): ConnectedRepository | undefined {
  const store = connections(), selected = store.selected(dir);
  return selected && new ConnectedRepository(new RemoteApi(store, selected.account.id), selected.binding.repository, selected.binding.controlled);
}
export class ConnectedRepository {
  readonly path: string;
  constructor(readonly api: RemoteApi, readonly repository: string, readonly controlled = false) { this.path = api.repoPath(repository); }
  async issues(): Promise<GhIssue[]> {
    return (await this.api.pages(this.path + '/issues?state=all')).filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, state: state(i), url: i.html_url,
      author: i.user?.login ?? '', labels: labels(i.labels), assignees: (i.assignees ?? []).map((a: any) => a.login), createdAt: i.created_at, updatedAt: i.updated_at,
      body: String(i.body ?? '').slice(0, 4000), comments: Number(i.comments ?? 0) }));
  }
  async pulls(): Promise<GhPull[]> {
    return (await this.api.pages(this.path + '/pulls?state=all')).map((p) => ({ readOnly: this.controlled, number: p.number, title: p.title, state: state(p), isDraft: !!p.draft || /^WIP:/i.test(p.title),
      url: p.html_url, author: p.user?.login ?? '', labels: labels(p.labels), reviewDecision: '', headRefName: p.head?.ref ?? '', headRefOid: p.head?.sha, baseRefName: p.base?.ref ?? '',
      createdAt: p.created_at, updatedAt: p.updated_at, additions: p.additions ?? 0, deletions: p.deletions ?? 0, checks: 'none', body: String(p.body ?? '').slice(0, 4000), closes: [] }));
  }
  async issue(number: number): Promise<GhIssueDetail> {
    const [i, comments] = await Promise.all([this.api.request(this.path + '/issues/' + number), this.api.pages(this.path + '/issues/' + number + '/comments')]);
    return { number: i.number, state: state(i), body: String(i.body ?? ''), comments: comments.map(comment), viewer: this.api.store.account(this.api.accountId).username };
  }
  async pull(number: number): Promise<GhPullDetail> {
    const prefix = this.path + '/pulls/' + number;
    const [p, comments, reviews, commits] = await Promise.all([this.api.request(prefix), this.api.pages(this.path + '/issues/' + number + '/comments'), this.api.pages(prefix + '/reviews'), this.api.pages(prefix + '/commits')]);
    return { number, headCommit: p.head?.sha, body: String(p.body ?? ''), state: state(p), isDraft: !!p.draft, reviewDecision: '', headRefName: p.head?.ref, baseRefName: p.base?.ref,
      mergeable: p.mergeable === true ? 'MERGEABLE' : p.mergeable === false ? 'CONFLICTING' : 'UNKNOWN', mergeStateStatus: p.mergeable === true ? 'CLEAN' : 'UNKNOWN', commits: commits.length,
      comments: comments.map(comment), reviews: reviews.map(comment), reviewComments: [], checks: [], repo: { nameWithOwner: this.repository, methods: this.controlled ? [] : ['merge', 'squash', 'rebase'] },
      viewer: this.api.store.account(this.api.accountId).username };
  }
  async diff(number: number): Promise<string> {
    return this.api.request(this.path + '/pulls/' + number + (this.api.server.provider === 'forgejo' ? '.diff' : ''), 'GET', undefined, true);
  }
  async comment(number: number, body: string): Promise<GhComment> { return comment(await this.api.request(this.path + '/issues/' + number + '/comments', 'POST', { body })); }
  async review(number: number, file: string): Promise<string> {
    if (this.controlled) throw Error('Usare la revisione documentale con commit e checker');
    const r = await this.api.request(this.path + '/pulls/' + number + '/reviews', 'POST', { body: await readFile(file, 'utf8'), event: 'COMMENT' }); return r.html_url ?? '';
  }
  async repoLabels(): Promise<GhLabel[]> { return labels(await this.api.pages(this.path + '/labels')); }
  async setLabels(number: number, add: string[], remove: string[]): Promise<GhLabel[]> {
    const prefix = this.path + '/issues/' + number + '/labels';
    const existing = labels(await this.api.request(prefix));
    const wanted = [...new Set([...existing.filter((l) => !remove.includes(l.name)).map((l) => l.name), ...add])];
    const payload = this.api.server.provider === 'forgejo' ? { labels: (await this.api.pages(this.path + '/labels')).filter((l) => wanted.includes(l.name)).map((l) => l.id) } : { labels: wanted };
    if (this.api.server.provider === 'forgejo' && payload.labels.length !== wanted.length) throw Error('Una o piu etichette non esistono nella repository');
    return labels(await this.api.request(prefix, 'PUT', payload));
  }
  async claim(number: number): Promise<void> {
    await this.api.request(this.path + '/issues/' + number + (this.api.server.provider === 'github' ? '/assignees' : ''), this.api.server.provider === 'github' ? 'POST' : 'PATCH', { assignees: [this.api.store.account(this.api.accountId).username] });
  }
  async close(kind: 'issue' | 'pull', number: number, body?: string): Promise<void> {
    if (this.controlled && kind === 'pull') throw Error('Le PR documentali seguono il servizio controllato');
    if (body) await this.comment(number, body);
    await this.api.request(this.path + (kind === 'pull' ? '/pulls/' : '/issues/') + number, 'PATCH', { state: 'closed' });
  }
  async merge(number: number, method: string, deleteBranch: boolean, auto: boolean, head?: string): Promise<void> {
    if (this.controlled) throw Error('Il merge documentale deve passare dal servizio dei gate');
    if (auto) throw Error('Il merge automatico non e disponibile per questa connessione');
    const p = await this.api.request(this.path + '/pulls/' + number);
    if (head && p.head?.sha !== head) throw Error('La revisione e cambiata: aggiornare la pull request');
    if (this.api.server.provider === 'forgejo') await this.api.request(this.path + '/pulls/' + number + '/merge', 'POST', { Do: method, head_commit_id: p.head?.sha, delete_branch_after_merge: deleteBranch });
    else {
      const result = await this.api.request(this.path + '/pulls/' + number + '/merge', 'PUT', { merge_method: method, sha: p.head?.sha });
      if (!result.merged) throw Error('Merge non confermato dal server');
      if (deleteBranch) await this.api.request(this.path + '/git/refs/heads/' + encodeURIComponent(p.head.ref), 'DELETE');
    }
  }
}
