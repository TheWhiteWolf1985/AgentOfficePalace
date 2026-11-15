import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

test('connection storage persists multiple identities without exposing tokens or exporting policies', () => {
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
    assert.equal(existsSync(path.join(f.root, 'public')), false);
    assert.equal(readFileSync(path.join(f.root, 'accounts', a.id + '.env'), 'utf8'), 'TOKEN="token_reader"\n');
    if (process.platform !== 'win32') assert.equal(statSync(path.join(f.root, 'accounts', a.id + '.env')).mode & 0o777, 0o600);
    assert.throws(() => persisted.token('../escape'), /Identificativo/);
    assert.throws(() => serverUrl('https://user:password@forgejo.example.org'), /Indirizzo/);
  } finally { f.close(); }
});

test('agents inherit the office account or a verified account on the same server', () => {
  const f = fixture();
  try {
    const reader = f.account('reader'), writer = f.account('writer');
    const binding = f.store.bind({ dir: path.join(f.root, 'repo'), floorId: 'project', accountId: reader.id, repository: 'org/project', agents: { agent1: { accountId: writer.id }, agent2: {} } });
    assert.equal(f.store.selected(binding.dir)?.account.id, reader.id);
    assert.equal(f.store.selected(binding.dir, 'agent1')?.account.id, writer.id);
    assert.equal(f.store.selected(binding.dir, 'agent2')?.account.id, reader.id);
    assert.equal(f.store.selected(binding.dir, 'new_agent')?.account.id, reader.id);
    assert.throws(() => f.store.remove('account', writer.id), /assegnato/);
    const foreign = f.store.putServer({ provider: 'github', url: 'https://github.com', name: 'GH' });
    const foreignUser = f.account('foreign', foreign.id);
    assert.throws(() => f.store.bind({ ...binding, agents: { agent1: { accountId: foreignUser.id } } }), /altro server/);
    f.store.putAccount({ ...writer, token: 'replacement' });
    assert.throws(() => f.store.selected(binding.dir, 'agent1'), /verificare/);
    assert.equal(f.store.selected(binding.dir, 'agent2')?.account.id, reader.id);
    f.store.putAccount({ ...reader, token: 'replacement' });
    assert.throws(() => f.store.selected(binding.dir), /verificare/);
  } finally { f.close(); }
});

test('reopening connection metadata preserves account assignments and ignores extra workflow fields', () => {
  const f = fixture();
  try {
    const account = f.account('reader');
    const binding = f.store.bind({ dir: path.join(f.root, 'repo'), floorId: 'project', accountId: account.id, repository: 'org/project', agents: { agent1: { accountId: account.id } } });
    const file = path.join(f.root, 'connections.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.bindings[0].workflow = { reviewers: ['old-team'] };
    data.bindings[0].agents.agent1.profile = 'old-profile';
    writeFileSync(file, JSON.stringify(data));
    const reopened = new ConnectionsStore(f.root);
    assert.deepEqual(reopened.binding(binding.dir), binding);
    assert.equal(reopened.selected(binding.dir, 'agent1')?.account.id, account.id);
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
    const env = gitEnvironment(f.store, a.id, 'org/wiki');
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

test('issue adaptation omits pull requests', async () => {
  const f = fixture();
  try {
    const a = f.account('reader');
    const api = new RemoteApi(f.store, a.id, (async () => Response.json([
      { number: 1, title: 'Issue', state: 'open', html_url: 'https://forgejo.example.org/org/wiki/issues/1', user: { login: 'alice' }, labels: [], assignees: [], comments: 2 },
      { number: 2, title: 'PR', pull_request: { url: 'pull' } },
    ])) as typeof fetch);
    const repository = new ConnectedRepository(api, 'org/wiki');
    const issues = await repository.issues();
    assert.equal(issues.length, 1); assert.equal(issues[0].state, 'OPEN'); assert.equal(issues[0].comments, 2);
  } finally { f.close(); }
});

test('configured Forgejo merges use its API and reject a stale head before posting', async () => {
  const f = fixture();
  try {
    const account = f.account('writer');
    const head = 'a'.repeat(40);
    const calls: { method: string; url: string; body?: string }[] = [];
    const api = new RemoteApi(f.store, account.id, (async (url: any, options: any) => {
      calls.push({ method: options.method, url: String(url), body: options.body });
      if (options.method === 'GET') return Response.json({ head: { sha: head, ref: 'feature' } });
      return new Response('', { status: 200 });
    }) as typeof fetch);
    const repository = new ConnectedRepository(api, 'org/project');
    await assert.rejects(repository.merge(2, 'squash', false, false, 'b'.repeat(40)), /revisione e cambiata/);
    assert.equal(calls.length, 1);
    await repository.merge(2, 'squash', false, false, head);
    assert.equal(calls.at(-1)?.method, 'POST');
    assert.equal(calls.at(-1)?.url, 'https://forgejo.example.org/api/v1/repos/org/project/pulls/2/merge');
    assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { Do: 'squash', head_commit_id: head, delete_branch_after_merge: false });
    await assert.rejects(repository.merge(2, 'merge', true, true, head), /automatico/);
  } finally { f.close(); }
});
