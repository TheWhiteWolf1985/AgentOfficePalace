import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { SignIns } from '../signins.js';
import { childEnv } from '../workers/env.js';
import { connections } from './store.js';
import { RemoteApi } from './api.js';

const exec = promisify(execFile);
type Flow = { id: string; serverId: string; name: string; accountId?: string; expires: number; signins: SignIns; pending?: Promise<string> };
const flows = new Map<string, Flow>();
export function startGithubLogin(serverId: string, name: string): { flow: string } {
  const store = connections(), server = store.server(serverId);
  if (server.provider !== 'github' || new URL(server.url).hostname !== 'github.com') throw Error('Per questo server usare un token');
  if (!name.trim() || name.length > 100) throw Error('Inserire un nome per l’account');
  for (const [key, flow] of flows) if (flow.expires < Date.now()) cancelGithubLogin(key);
  if (flows.size >= 3) throw Error('Completare o annullare gli accessi gia in corso');
  const id = randomBytes(12).toString('hex');
  const signins = new SignIns(path.join(store.root, 'login-flows', id), null, 'gh', childEnv, () => false, () => {});
  const error = signins.start(id, 'github');
  if (error) throw Error(error);
  flows.set(id, { id, serverId, name, expires: Date.now() + 15 * 60_000, signins });
  return { flow: id };
}
export async function githubLoginState(id: string): Promise<unknown> {
  const f = flows.get(id);
  if (!f || f.expires < Date.now()) { cancelGithubLogin(id); throw Error('Accesso scaduto o non disponibile'); }
  const state = f.signins.state(f.id).github;
  if (state.status === 'ok') {
    f.pending ??= (async () => {
      const as = f.signins.ghAs(f.id);
      if (!as || typeof as === 'string') throw Error('Identita GitHub non disponibile');
      const { stdout } = await exec('gh', ['auth', 'token', '--hostname', 'github.com'], { env: as.env, timeout: 10000 });
      const store = connections();
      const account = store.putAccount({ serverId: f.serverId, name: f.name, token: stdout.trim() });
      await new RemoteApi(store, account.id).verify();
      f.accountId = account.id;
      return account.id;
    })();
    const accountId = await f.pending;
    cancelGithubLogin(id);
    return { status: 'ok', accountId };
  }
  return { status: state.status, pending: state.pending, error: state.error, expiresAt: f.expires };
}
export function cancelGithubLogin(id: string): void {
  const f = flows.get(id); if (!f) return;
  f.signins.cancel(f.id, 'github');
  rmSync(path.join(connections().root, 'login-flows', f.id), { recursive: true, force: true });
  flows.delete(id);
}
