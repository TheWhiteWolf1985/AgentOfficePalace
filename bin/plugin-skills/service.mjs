import http from 'node:http';
import path from 'node:path';
import { chmodSync, lstatSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { accessGrant, begin, exchange, googleSecretIssue, identity, invoke, operations, Problem, providers, string } from './providers.mjs';
import { openCallback, removeStaleCallbacks, tunnelProfile } from './auth-tunnel.mjs';
import { heygenClient } from './heygen.mjs';
import { pdfTools, processPdf } from './pdf.mjs';

process.umask(0o077);
const data = path.join(process.env.AOP_PLUGIN_DATA_DIR || '/data', 'accounts.json');
const socket = process.env.AOP_PLUGIN_SOCKET || '/run/office/plugins.sock';
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
function forget(id) {
  const flow = pending.get(id);
  if (!flow) return;
  clearTimeout(flow.timer);
  flow.tunnel?.close();
  pending.delete(id);
}
function tunnelView(flow) {
  return { url: flow.tunnel.url, command: flow.tunnel.command, until: flow.until };
}
const locks = new Map();
async function withAccount(id, action) {
  const job = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
  locks.set(id, job);
  try { return await job; } finally { if (locks.get(id) === job) locks.delete(id); }
}
function needsLogin(account) {
  return !!account && (account.reauth || (account.kind === 'oauth' && !account.refresh && account.expires <= Date.now()));
}
function snapshot(browser) {
  return {
    providers: [...providers].map(([id, p]) => {
      const account = state.accounts[id];
      const client = state.clients?.[id] ?? account;
      const clientIssue = id === 'drive' && client?.clientId ? googleSecretIssue(client.secret, client.clientId) : undefined;
      const flow = pending.get(id);
      const tunnel = flow?.tunnel && flow.browser === browser && flow.until > Date.now() && !flow.tunnel.received ? tunnelView(flow) : undefined;
      return { id, name: p.name, account: account?.label, tunnel, hasClient: !!client?.clientId, clientIssue,
        status: needsLogin(account) ? 'reconnect' : account ? 'connected' : 'disconnected' };
    }),
    skills: [...skills].map(([id, s]) => ({ id, name: s.name, description: s.description, enabled: state.skills[id] === true })),
  };
}
function checkProvider(id) {
  if (!providers.has(id)) throw new Problem(400, 'Unknown plugin.');
}
async function admin(op, b) {
  if (op === 'status') return snapshot(b.browser);
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
      forget(id);
      save(next => {
        if (id === 'drive' && !next.clients?.drive && old?.kind === 'oauth') {
          (next.clients ??= {}).drive = { clientId: old.clientId, secret: old.secret };
        }
        delete next.accounts[id];
      });
      return snapshot();
    }
    if (op === 'client' && id === 'drive') {
      const saved = state.clients?.drive ?? old;
      const clientId = string(b.clientId === '' || b.clientId === undefined ? saved?.clientId : b.clientId, 1024, 'OAuth client ID required.');
      if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Problem(400, 'Enter a Google web application client ID.');
      const secret = string(b.secret, 2048, 'OAuth client secret required.');
      const issue = googleSecretIssue(secret, clientId);
      if (issue) throw new Problem(400, issue);
      save(next => { (next.clients ??= {}).drive = { clientId, secret }; });
      forget(id);
      return snapshot();
    }
    if (op === 'begin' || op === 'tunnel') {
      const previous = pending.get(id);
      if (previous?.until > Date.now() && (previous.tunnel || op === 'tunnel')) throw new Problem(409, 'A sign-in is already in progress.');
      const profile = op === 'tunnel' ? tunnelProfile(id, b.origin) : undefined;
      const redirect = profile?.redirect.href ?? b.redirect;
      const browser = string(b.browser, 128, 'Sign-in expired or belongs to another browser.');
      const saved = state.clients?.[id] ?? old;
      const account = id === 'heygen' ? await heygenClient(redirect, saved) : {
        kind: 'oauth', clientId: string(b.clientId || saved?.clientId, 1024, 'OAuth client ID required.'),
        secret: string(b.secret || ((!b.clientId || b.clientId === saved?.clientId) && saved?.secret), 2048, 'OAuth client secret required.'),
      };
      if (id === 'drive') {
        const issue = googleSecretIssue(account.secret, account.clientId);
        if (issue) throw new Problem(400, issue);
      }
      if (id === 'heygen') save(next => { (next.clients ??= {}).heygen = account; });
      const flow = { ...begin(id, account.clientId, redirect, id === 'heygen' ? account : undefined), account, redirect, browser, until: Date.now() + 600_000 };
      forget(id);
      if (profile) flow.tunnel = await openCallback({ profile, directory: path.dirname(socket),
        hostDirectory: process.env.AOP_PLUGIN_HOST_SOCKET_DIR || path.dirname(socket), authorization: flow.url, state: flow.state, until: flow.until });
      flow.timer = setTimeout(() => forget(id), Math.max(1, flow.until - Date.now())).unref();
      pending.set(id, flow);
      return flow.tunnel ? tunnelView(flow) : { url: flow.url };
    }
    if (op === 'cancel' || op === 'finish') {
      const flow = pending.get(id);
      if (!flow || flow.until <= Date.now() || flow.browser !== b.browser) throw new Problem(400, 'Sign-in expired or belongs to another browser.');
      if (op === 'cancel' && flow.tunnel) { forget(id); return snapshot(); }
      if (op !== 'finish' || (!flow.tunnel && flow.state !== b.state)) throw new Problem(400, 'Sign-in expired or belongs to another browser.');
      const code = flow.tunnel ? flow.tunnel.redeem(b.receipt) : b.code;
      forget(id);
      if (!code) throw new Problem(400, 'Sign-in was cancelled.');
      const token = await exchange(id, flow.account, { grant_type: 'authorization_code', code: string(code, 4096, 'Invalid code.'),
        redirect_uri: flow.redirect, code_verifier: flow.verifier });
      if (!token.refresh && (id === 'drive' || id === 'canva')) throw new Problem(400, 'Offline access was not granted. Reconnect this account.');
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
    if (!account || needsLogin(account)) throw new Problem(409, 'The plugin is disconnected.');
    if (account.expires > Date.now() + 60_000 || (account.kind === 'oauth' && !account.refresh)) return account.access;
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
    tools: operations.filter(tool => { const a = state.accounts[tool.name.split('.')[0]]; return a && !needsLogin(a); })
      .concat(skills.has('pdf-ocr') && state.skills['pdf-ocr'] ? pdfTools : []),
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
    let result;
    if (req.url === '/worker/file') {
      if (!skills.has('pdf-ocr') || !state.skills['pdf-ocr']) throw new Problem(404, 'Skill unavailable.');
      if (req.headers['content-type'] !== 'application/octet-stream') throw new Problem(415, 'File upload required.');
      result = await processPdf(req);
    } else {
      result = await (route[1] === 'admin' ? admin : worker)(route[2], await body(req));
    }
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
removeStaleCallbacks(path.dirname(socket));
server.listen(socket, () => chmodSync(socket, 0o600));
