import type { GitRepository, GitServer } from '../../shared/connections.js';
import { type ConnectionsStore, repositoryName } from './store.js';

export function apiBase(server: GitServer): string {
  const url = new URL(server.url);
  return server.provider === 'forgejo' ? server.url + '/api/v1' : url.hostname === 'github.com' ? 'https://api.github.com' : server.url + '/api/v3';
}
export class RemoteApi {
  readonly server: GitServer;
  constructor(readonly store: ConnectionsStore, readonly accountId: string, private fetcher: typeof fetch = fetch) {
    this.server = store.server(store.account(accountId).serverId);
  }
  async request(endpoint: string, method = 'GET', body?: unknown, text = false): Promise<any> {
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://')) throw Error('Percorso API non valido');
    const response = await this.fetcher(apiBase(this.server) + endpoint, {
      method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: (this.server.provider === 'github' ? 'Bearer ' : 'token ') + this.store.token(this.accountId), Accept: text ? 'application/vnd.github.diff' : 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw Error(`${this.server.provider === 'github' ? 'GitHub' : 'Forgejo'}: HTTP ${response.status}${response.status === 401 ? ' — credenziale non valida' : response.status === 403 ? ' — permessi insufficienti' : response.status === 404 ? ' — risorsa non accessibile' : ''}`);
    if (response.status === 204) return undefined;
    return text ? response.text() : response.json();
  }
  async pages(endpoint: string, limit = 1000): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= Math.ceil(limit / 50); page++) {
      const items = await this.request(endpoint + (endpoint.includes('?') ? '&' : '?') + `page=${page}&per_page=50&limit=50`);
      if (!Array.isArray(items)) throw Error('Il server ha restituito un elenco non valido');
      result.push(...items);
      if (items.length < 50) return result;
    }
    throw Error('Elenco troppo lungo: restringere la ricerca o la selezione delle repository del token');
  }
  async verify(): Promise<string> {
    try {
      const user = await this.request('/user');
      if (typeof user.login !== 'string' || !user.login) throw Error('Identita dell’account non disponibile');
      this.store.verification(this.accountId, user.login); return user.login;
    } catch (error) {
      this.store.verification(this.accountId, '', error instanceof Error ? error.message : 'Verifica non riuscita');
      throw error;
    }
  }
  repoPath(repository: string): string { return '/repos/' + repositoryName(repository).split('/').map(encodeURIComponent).join('/'); }
  normalizeRepo(r: any): GitRepository {
    return { name: repositoryName(r.full_name), description: String(r.description ?? ''), private: r.private === true,
      cloneUrl: this.server.url + '/' + repositoryName(r.full_name) + '.git', webUrl: this.server.url + '/' + r.full_name,
      permissions: { read: true, write: r.permissions?.push === true || r.permissions?.admin === true, admin: r.permissions?.admin === true } };
  }
  async repositories(): Promise<GitRepository[]> { return (await this.pages('/user/repos?sort=updated')).map((r) => this.normalizeRepo(r)); }
  async repository(repository: string): Promise<GitRepository> { return this.normalizeRepo(await this.request(this.repoPath(repository))); }
}
