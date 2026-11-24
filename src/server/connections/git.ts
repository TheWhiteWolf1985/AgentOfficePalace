import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { connections, type ConnectionsStore } from './store.js';

const exec = promisify(execFile);
/** Only this process gets this account's credentials. No URL or Git config file contains a token. */
export function gitEnvironment(store: ConnectionsStore, accountId: string, repository: string): Record<string, string> {
  const account = store.account(accountId), server = store.server(account.serverId);
  if (!account.verifiedAt) throw Error('Verificare prima l’account');
  const token = store.token(accountId);
  const header = 'Authorization: Basic ' + Buffer.from(account.username + ':' + token).toString('base64');
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    AGENT_OFFICE_REMOTE_PROVIDER: server.provider, AGENT_OFFICE_REMOTE_URL: server.url,
    AGENT_OFFICE_REMOTE_TOKEN: token, AGENT_OFFICE_REMOTE_LOGIN: account.username,
    AGENT_OFFICE_REMOTE_ACCOUNT: account.id, AGENT_OFFICE_REMOTE_REPOSITORY: repository,
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'http.' + server.url + '/.extraHeader', GIT_CONFIG_VALUE_0: header,
    GIT_CONFIG_KEY_1: 'url.' + server.url + '/' + repository + '.git.insteadOf', GIT_CONFIG_VALUE_1: server.url + '/' + repository + '.git',
  };
  return env;
}
export function workerConnections(dir: string, workerId: string, env: Record<string, string>): void {
  const store = connections(), selected = store.selected(dir, workerId);
  if (!selected) return;
  if (selected.account.id === process.env.AGENT_OFFICE_FLOOR_READER) return;
  for (const key of Object.keys(env)) if (/^(GH_HOST|GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|AGENT_OFFICE_REMOTE_|GIT_CONFIG_)/.test(key)) delete env[key];
  Object.assign(env, gitEnvironment(store, selected.account.id, selected.binding.repository));
  env.GIT_CONFIG_VALUE_1 = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 5000 }).trim();
  if (selected.server.provider === 'github') {
    const host = new URL(selected.server.url).hostname;
    env.GH_HOST = host;
    env[host === 'github.com' ? 'GH_TOKEN' : 'GH_ENTERPRISE_TOKEN'] = store.token(selected.account.id);
  }
}
export async function verifyGit(store: ConnectionsStore, accountId: string, repository: string): Promise<{ read: true; write: boolean; admin: boolean }> {
  const { RemoteApi } = await import('./api.js');
  const repo = await new RemoteApi(store, accountId).repository(repository);
  try {
    await exec('git', ['ls-remote', '--heads', repo.cloneUrl], { env: { ...process.env, ...gitEnvironment(store, accountId, repository) }, timeout: 30000, maxBuffer: 1024 * 1024 });
  } catch { throw Error('Accesso API riuscito, ma lettura Git non riuscita: verificare indirizzo e credenziale'); }
  return { read: true, write: repo.permissions.write, admin: repo.permissions.admin };
}
export async function cloneRepository(store: ConnectionsStore, accountId: string, repository: string, destination: string): Promise<void> {
  const { RemoteApi } = await import('./api.js');
  const repo = await new RemoteApi(store, accountId).repository(repository);
  try { await exec('git', ['clone', '--', repo.cloneUrl, destination], { env: { ...process.env, ...gitEnvironment(store, accountId, repository) }, timeout: 300000, maxBuffer: 2 * 1024 * 1024 }); }
  catch { throw Error('Clone non riuscito: controllare connessione, permessi e cartella di destinazione'); }
}
