import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ConnectionsStore, serverUrl } from '../src/server/connections/store.js';
import { RemoteApi, apiBase } from '../src/server/connections/api.js';
import { ConnectedRepository } from '../src/server/connections/repository.js';
import { gitEnvironment } from '../src/server/connections/git.js';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'office-connections-'));
  const store = new ConnectionsStore(root);
  const server = store.putServer({ name: 'Forgejo', provider: 'forgejo', url: 'https://forgejo.example.org' });
  const account = (username: string, serverId = server.id) => {
    const a = store.putAccount({ serverId, name: username, username, token: 'token_' + username });
    store.verification(a.id, username); return store.account(a.id);
  };
  return { root, store, server, account, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('connection storage persists multiple identities while public metadata and policies contain no token', () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const other = f.store.putServer({ name: 'GitHub', provider: 'github', url: 'https://github.com/' });
    const b = f.account('reader', other.id);
    assert.notEqual(a.id, b.id);
    const persisted = new ConnectionsStore(f.root);
    assert.equal(persisted.token(a.id), 'token_reader');
    assert.equal(persisted.snapshot().accounts.length, 2);
    assert.ok(!JSON.stringify(persisted.snapshot()).includes('token_reader'));
    assert.ok(!readFileSync(path.join(f.root, 'public/policies.json'), 'utf8').includes('token_reader'));
    assert.equal(readFileSync(path.join(f.root, 'accounts', a.id + '.env'), 'utf8'), 'TOKEN="token_reader"\n');
    if (process.platform !== 'win32') assert.equal(statSync(path.join(f.root, 'accounts', a.id + '.env')).mode & 0o777, 0o600);
    assert.throws(() => persisted.token('../escape'), /Identificativo/);
    assert.throws(() => serverUrl('https://user:password@forgejo.example.org'), /Indirizzo/);
  } finally { f.close(); }
});

test('role default and per-agent overrides resolve only on the same server and protect controlled bindings', () => {
  const f = fixture();
  try {
    const reader = f.account('reader'), writer = f.account('writer'), analyst = f.account('analyst'), editor = f.account('editor');
    const roles = { lettura: reader.id, caporedattore: writer.id, capoanalista: analyst.id, capoeditore: editor.id };
    const binding = f.store.bind({ dir: path.join(f.root, 'repo'), floorId: 'docs', accountId: reader.id, repository: 'org/wiki', controlled: true, roles, agents: { agent1: { role: 'caporedattore' }, agent2: { role: 'caporedattore', accountId: reader.id } } });
    assert.equal(f.store.selected(binding.dir, 'agent1')?.account.id, writer.id);
    assert.equal(f.store.selected(binding.dir, 'agent2')?.account.id, reader.id);
    assert.equal(f.store.selected(binding.dir, 'new_agent')?.account.id, reader.id);
    assert.throws(() => f.store.bind({ ...binding, controlled: false }), /controllato/);
    assert.throws(() => f.store.bind({ ...binding, roles: { ...roles, capoeditore: analyst.id } }), /distinti/);
    assert.throws(() => f.store.remove('account', writer.id), /assegnato/);
    const foreign = f.store.putServer({ provider: 'github', url: 'https://github.com', name: 'GH' });
    const foreignUser = f.account('foreign', foreign.id);
    assert.throws(() => f.store.bind({ ...binding, roles: { ...roles, caporedattore: foreignUser.id } }), /altro server/);
    f.store.putAccount({ ...reader, token: 'replacement' });
    assert.throws(() => f.store.selected(binding.dir), /verificare/);
  } finally { f.close(); }
});

test('Forgejo and GitHub adapters authenticate with the selected token and paginate without leaking credentials', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const calls: { url: string; authorization: string }[] = [];
    const fetcher = (async (url: any, options: any) => {
      calls.push({ url: String(url), authorization: options.headers.Authorization });
      if (String(url).endsWith('/user')) return Response.json({ login: 'reader' });
      const repos = Array.from({ length: String(url).includes('page=1&') ? 50 : 1 }, (_, i) => ({ full_name: 'org/repo' + i, permissions: { pull: true, push: false } }));
      return Response.json(repos);
    }) as typeof fetch;
    const api = new RemoteApi(f.store, a.id, fetcher);
    await api.verify();
    assert.equal((await api.repositories()).length, 51);
    assert.ok(calls.every((c) => c.authorization === 'token token_reader' && !c.url.includes('token_reader')));
    const gh = f.store.putServer({ provider: 'github', name: 'GH', url: 'https://github.com' });
    assert.equal(apiBase(gh), 'https://api.github.com');
    const b = f.account('reader', gh.id);
    await new RemoteApi(f.store, b.id, fetcher).verify();
    assert.equal(calls.at(-1)?.authorization, 'Bearer token_reader');
    assert.equal(calls.at(-1)?.url, 'https://api.github.com/user');
  } finally { f.close(); }
});

test('expired and wrong-user credentials fail verification without retaining a verified state', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    await assert.rejects(new RemoteApi(f.store, a.id, (async () => new Response('', { status: 401 })) as typeof fetch).verify(), /401/);
    assert.equal(f.store.account(a.id).verifiedAt, undefined);
    await assert.rejects(new RemoteApi(f.store, a.id, (async () => Response.json({ login: 'someone_else' })) as typeof fetch).verify(), /altro utente/);
    assert.equal(f.store.account(a.id).verifiedAt, undefined);
  } finally { f.close(); }
});

test('Git authentication is confined to the requested process and no credential appears in the repository URL', () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const env = gitEnvironment(f.store, a.id, 'org/wiki', 'lettura');
    const actual = execFileSync('git', ['config', '--get-urlmatch', 'http.extraHeader', f.server.url + '/org/wiki.git'], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
    assert.equal(actual, 'Authorization: Basic ' + Buffer.from('reader:token_reader').toString('base64'));
    assert.ok(!env.GIT_CONFIG_KEY_0.includes('token_reader'));
    assert.equal(process.env.AGENT_OFFICE_REMOTE_TOKEN, undefined);
  } finally { f.close(); }
});

test('rotating a token during an API verification cannot approve the untested replacement', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const api = new RemoteApi(f.store, a.id, (async () => {
      f.store.putAccount({ ...a, token: 'rotated_token' });
      return Response.json({ login: 'reader' });
    }) as typeof fetch);
    await assert.rejects(api.verify(), /cambiata durante/);
    assert.equal(f.store.account(a.id).verifiedAt, undefined);
  } finally { f.close(); }
});

test('successful Forgejo operations may return HTTP 200 with an empty body', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const api = new RemoteApi(f.store, a.id, (async () => new Response('', { status: 200 })) as typeof fetch);
    assert.equal(await api.request('/repos/org/wiki/pulls/1/merge', 'POST', {}), undefined);
  } finally { f.close(); }
});

test('issue adaptation omits pull requests and controlled repositories refuse direct merge', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const api = new RemoteApi(f.store, a.id, (async () => Response.json([
      { number: 1, title: 'Issue', state: 'open', html_url: 'https://forgejo.example.org/org/wiki/issues/1', user: { login: 'alice' }, labels: [], assignees: [], comments: 2 },
      { number: 2, title: 'PR', pull_request: { url: 'pull' } },
    ])) as typeof fetch);
    const repository = new ConnectedRepository(api, 'org/wiki', true);
    const issues = await repository.issues();
    assert.equal(issues.length, 1); assert.equal(issues[0].state, 'OPEN'); assert.equal(issues[0].comments, 2);
    await assert.rejects(repository.merge(2, 'merge', true, false), /servizio dei gate/);
  } finally { f.close(); }
});
