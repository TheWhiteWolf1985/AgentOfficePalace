import http from 'node:http';
import path from 'node:path';
import { chmodSync, lstatSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { accessGrant, begin, exchange, identity, invoke, operations, Problem, providers, string } from './providers.mjs';

process.umask(0o077);
const data = '/data/accounts.json';
const socket = '/run/office/plugins.sock';
let state;
try { state = JSON.parse(readFileSync(data, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = { version: 1, accounts: {}, skills: {} };
}
if (state?.version !== 1 || !state.accounts || !state.skills) throw Error('Invalid Plugin & Skills data');
function save(update) {
  const next = structuredClone(state);
  update(next);
  writeFileSync(data + '.tmp', JSON.stringify(next), { mode: 0o600, flush: true });
  renameSync(data + '.tmp', data);
  state = next;
}

const skills = new Map();
for (const entry of readdirSync(new URL('./skills/', import.meta.url), { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name)) continue;
  try {
    const text = readFileSync(new URL('./skills/' + entry.name + '/SKILL.md', import.meta.url), 'utf8');
    const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1];
    const description = header && /^description: (.+)$/m.exec(header)?.[1]?.trim();
    const name = /^# (.+)$/m.exec(text)?.[1]?.trim();
    if (!description || !name || Buffer.byteLength(text) > 64 * 1024) throw Error();
    skills.set(entry.name, { name, description, text });
  } catch { console.warn('Invalid skill package:', entry.name); }
}
const pending = new Map();
const locks = new Map();
async function withAccount(id, action) {
  const job = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
  locks.set(id, job);
  try { return await job; } finally { if (locks.get(id) === job) locks.delete(id); }
}
function snapshot() {
  return {
    providers: [...providers].map(([id, p]) => {
      const account = state.accounts[id];
      return { id, name: p.name, account: account?.label, hasClient: !!account?.clientId,
        status: account?.reauth ? 'reconnect' : account ? 'connected' : 'disconnected' };
    }),
    skills: [...skills].map(([id, s]) => ({ id, name: s.name, description: s.description, enabled: state.skills[id] === true })),
  };
}
function checkProvider(id) {
  if (!providers.has(id)) throw new Problem(400, 'Unknown plugin.');
}
async function admin(op, b) {
  if (op === 'status') return snapshot();
  if (op === 'skill') {
    if (!skills.has(b.id) || typeof b.enabled !== 'boolean') throw new Problem(400, 'Unknown skill.');
    save(next => { next.skills[b.id] = b.enabled; });
    return snapshot();
  }
  const id = b.id;
  checkProvider(id);
  return withAccount(id, async () => {
    const old = state.accounts[id];
    if (op === 'disconnect') {
      pending.delete(id);
      save(next => { delete next.accounts[id]; });
      return snapshot();
    }
    if (op === 'service' && id === 'drive') {
      const k = b.credential;
      if (k?.type !== 'service_account') throw new Problem(400, 'Invalid service account key.');
      const account = { kind: 'service', email: string(k.client_email, 320, 'Invalid service account key.'),
        key: string(k.private_key, 8192, 'Invalid service account key.') };
      const token = await exchange(id, account, accessGrant(account));
      const label = await identity(id, token.access);
      save(next => { next.accounts[id] = { ...account, ...token, label }; });
      pending.delete(id);
      return snapshot();
    }
    if (op === 'begin') {
      const account = {
        kind: 'oauth', clientId: string(b.clientId || old?.clientId, 1024, 'OAuth client ID required.'),
        secret: string(b.secret || ((!b.clientId || b.clientId === old?.clientId) && old?.secret), 2048, 'OAuth client secret required.'),
      };
      const flow = begin(id, account.clientId, b.redirect);
      pending.set(id, { ...flow, account, redirect: b.redirect, browser: b.browser, until: Date.now() + 600_000 });
      setTimeout(() => { if (pending.get(id)?.state === flow.state) pending.delete(id); }, 600_000).unref();
      return { url: flow.url };
    }
    if (op === 'finish') {
      const flow = pending.get(id);
      if (!flow || flow.until < Date.now() || flow.state !== b.state || flow.browser !== b.browser) throw new Problem(400, 'Sign-in expired or belongs to another browser.');
      pending.delete(id);
      if (!b.code) throw new Problem(400, 'Sign-in was cancelled.');
      const token = await exchange(id, flow.account, { grant_type: 'authorization_code', code: string(b.code, 4096, 'Invalid code.'),
        redirect_uri: flow.redirect, code_verifier: flow.verifier });
      if (!token.refresh) throw new Problem(400, 'Offline access was not granted. Reconnect this account.');
      const label = await identity(id, token.access);
      save(next => { next.accounts[id] = { ...flow.account, ...token, label }; });
      return { connected: true };
    }
    throw new Problem(400, 'Unknown operation.');
  });
}

async function getAccess(id) {
  return withAccount(id, async () => {
    const account = state.accounts[id];
    if (!account || account.reauth) throw new Problem(409, 'The plugin is disconnected.');
    if (account.expires > Date.now() + 60_000) return account.access;
    try {
      const token = await exchange(id, account, accessGrant(account));
      save(next => Object.assign(next.accounts[id], token));
      return token.access;
    } catch (error) {
      if (error.status === 401) save(next => { next.accounts[id].reauth = true; });
      throw error;
    }
  });
}
async function worker(op, b) {
  if (op === 'list') return {
    tools: operations.filter(tool => { const a = state.accounts[tool.name.split('.')[0]]; return a && !a.reauth; }),
    skills: [...skills].filter(([id]) => state.skills[id]).map(([id, s]) => ({ name: 'skill.' + id, description: s.description })),
  };
  if (op !== 'use') throw new Problem(404, 'Unknown operation.');
  const name = string(b.name, 128, 'Tool name required.');
  if (name.startsWith('skill.')) {
    const id = name.slice(6);
    if (!skills.has(id) || !state.skills[id]) throw new Problem(404, 'Skill unavailable.');
    return { instructions: skills.get(id).text };
  }
  if (!operations.some(tool => tool.name === name)) throw new Problem(404, 'Tool unavailable.');
  const id = name.split('.')[0];
  const access = await getAccess(id);
  try { return await invoke(name, b.arguments ?? {}, access); }
  catch (error) {
    if (error.status === 401) await withAccount(id, () => {
      // Let the next call renew a rejected access token. A reconnect may already have replaced it.
      if (state.accounts[id]?.access === access) save(next => { next.accounts[id].expires = 0; });
    });
    throw error;
  }
}

async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new Problem(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* invalid request */ }
  throw new Problem(400, 'Invalid request.');
}

const server = http.createServer(async (req, res) => {
  try {
    const route = /^\/(admin|worker)\/([a-z]+)$/.exec(req.url || '');
    if (req.method !== 'POST' || !route) throw new Problem(404, 'Unknown operation.');
    const input = await body(req);
    const result = await (route[1] === 'admin' ? admin : worker)(route[2], input);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch (error) {
    const expected = error instanceof Problem;
    res.writeHead(expected ? error.status : 500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: expected ? error.message : 'Plugin service error.' }));
  }
});
server.requestTimeout = 30_000;
// Only this named container owns the socket directory, including after a Docker restart.
const existing = lstatSync(socket, { throwIfNoEntry: false });
if (existing) {
  if (!existing.isSocket()) throw Error('Unexpected file at ' + path.basename(socket));
  unlinkSync(socket);
}
server.listen(socket, () => chmodSync(socket, 0o600));
