import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_IMAGE, cliEnv, docker, dockerPrefix, dockerRoot } from './docker.js';
import { displayAccount } from './docker-accounts.js';

type Tokens = { id_token: string; access_token: string; refresh_token: string; account_id?: string; oauth_provenance?: {issuer: string; client_id: string} };
type Credential = {auth_mode: 'apikey'; OPENAI_API_KEY: string} | {auth_mode: 'chatgpt'; tokens: Tokens; last_refresh?: string};
type Saved = { generation: string; revision: string; credential: Credential };
export class SharedLoginExpired extends Error {}
const unavailable = () => Error('Accesso Codex condiviso non disponibile');
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function credential(value: any): Credential {
  if (value?.auth_mode === 'apikey' && nonempty(value.OPENAI_API_KEY)) return {auth_mode:'apikey', OPENAI_API_KEY:value.OPENAI_API_KEY};
  const t = value?.tokens;
  if ((value?.auth_mode === 'chatgpt' || !value?.auth_mode) && nonempty(t?.access_token) && nonempty(t?.id_token) && nonempty(t?.refresh_token)) {
    if (t.oauth_provenance && (t.oauth_provenance.issuer !== 'https://auth.openai.com' || !nonempty(t.oauth_provenance.client_id))) throw unavailable();
    return {auth_mode:'chatgpt', tokens:t, last_refresh:value.last_refresh};
  }
  throw unavailable();
}

function storeDir() {
  const root = dockerRoot();
  if (!root || !path.isAbsolute(root)) throw unavailable();
  return path.join(root, 'shared-codex');
}
async function load(): Promise<Saved | undefined> {
  try {
    const saved = JSON.parse(await readFile(path.join(storeDir(), 'account.json'), 'utf8'));
    if (!nonempty(saved.generation) || !nonempty(saved.revision)) throw unavailable();
    return {generation:saved.generation, revision:saved.revision, credential:credential(saved.credential)};
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw unavailable(); }
}
async function save(saved: Saved) {
  const dir = storeDir();
  await mkdir(dir, {recursive:true, mode:0o700});
  const temp = path.join(dir, randomUUID() + '.tmp');
  try {
    await writeFile(temp, JSON.stringify(saved), {mode:0o600, flag:'wx'});
    await rename(temp, path.join(dir, 'account.json'));
  } finally { await rm(temp, {force:true}); }
}

// One Office process owns the runtime hook socket. Coordinate logins and refreshes
// through the same queue, including the read preceding each token exchange.
let previous = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = previous.then(work);
  previous = result.then(() => {}, () => {});
  return result;
}
function marker(saved: Saved) {
  return saved.generation + '.' + saved.revision;
}
function project(saved: Saved) {
  const auth = saved.credential;
  if (auth.auth_mode === 'apikey') return auth;
  const {id_token,access_token,account_id} = auth.tokens;
  return {auth_mode:'chatgpt' as const, last_refresh:auth.last_refresh, tokens:{id_token,access_token,account_id, refresh_token:marker(saved)}};
}
export async function sharedAccount() {
  const saved = await load();
  return saved ? displayAccount(saved.credential) : 'signed-out' as const;
}
export async function workerCredential(refresh?: string) {
  return exclusive(async () => {
    const saved = await load();
    if (!saved) return;
    if (refresh === undefined) return project(saved);
    const auth = saved.credential;
    if (auth.auth_mode !== 'chatgpt' || !refresh.startsWith(saved.generation + '.')) throw new SharedLoginExpired();
    if (refresh === marker(saved)) {
      const response = await fetch('https://auth.openai.com/oauth/token', {method:'POST', redirect:'error',
        headers:{'content-type':'application/json'}, signal:AbortSignal.timeout(45_000),
        body:JSON.stringify({grant_type:'refresh_token', client_id:auth.tokens.oauth_provenance?.client_id ?? 'app_EMoamEEZ73f0CkXaXp7hrann', refresh_token:auth.tokens.refresh_token})});
      if (response.status === 401 || response.status === 400) throw new SharedLoginExpired();
      if (!response.ok) throw unavailable();
      const body = await response.json();
      if (!nonempty(body.access_token) || (body.refresh_token != null && !nonempty(body.refresh_token)) ||
          (body.id_token != null && !nonempty(body.id_token))) throw unavailable();
      auth.tokens = {...auth.tokens, access_token:body.access_token, refresh_token:body.refresh_token ?? auth.tokens.refresh_token,
        id_token:body.id_token ?? auth.tokens.id_token};
      auth.last_refresh = new Date().toISOString();
      saved.revision = randomUUID();
      await save(saved);
    }
    return project(saved);
  });
}

type Flow = {owner: string; state:'waiting'|'ready'|'failed'; url?: string; code?: string};
let flow: Flow | undefined;
export async function sharedLoginStatus(owner: string) {
  const account = await sharedAccount();
  if (!flow || flow.owner !== owner) return {account, state:flow?.state === 'waiting' ? 'busy' : 'none'};
  return {account, state:flow.state, url:flow.url, code:flow.code};
}
export async function startSharedLogin(owner: string, key?: string) {
  if (key !== undefined && (!key.trim() || key.length > 1024 || /\s/.test(key))) throw Error('Chiave API non valida');
  if (flow?.state === 'waiting') throw Error('È già in corso un accesso Codex');
  // This trusted, disposable login process has no host mounts, worker hooks or Docker
  // log capture. Only the completed CLI credential goes to stdout, never to the UI.
  const args = [...dockerPrefix(), 'run','--rm','-i','--pull=never','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--log-driver=none','--pids-limit=64','--memory=512m','--tmpfs','/tmp:rw,nosuid,nodev,size=32m','-w','/tmp',
    '-e','HOME=/tmp','-e','CODEX_HOME=/tmp/login','--entrypoint=/bin/sh',process.env.AGENT_OFFICE_CODEX_IMAGE || AGENT_IMAGE,
    '-ec','umask 077; mkdir -p "$CODEX_HOME"; timeout 900 codex login "$1" >&2; cat "$CODEX_HOME/auth.json"', 'login',key === undefined ? '--device-auth' : '--with-api-key'];
  const current: Flow = {owner,state:'waiting'};
  flow = current;
  try {
    const security = await docker(['info','--format','{{json .SecurityOptions}}']);
    if (!JSON.parse(security).includes('name=rootless')) throw unavailable();
  } catch { current.state = 'failed'; throw unavailable(); }
  const proc = spawn('docker', args, {env:cliEnv(), stdio:'pipe', timeout:16*60_000});
  let output = '', diagnostic = '';
  proc.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    if (output.length + chunk.length > 128*1024) { proc.kill(); return; }
    output += chunk;
  });
  proc.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    if (key !== undefined) return;
    diagnostic = (diagnostic + chunk).slice(-8192).replace(/\x1b\[[0-9;]*m/g,'');
    const url = diagnostic.match(/https:\/\/auth\.openai\.com\/codex\/device\b/)?.[0];
    const code = diagnostic.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0];
    if (url && code) Object.assign(current,{url,code});
  });
  const done = new Promise<void>((resolve,reject) => {
    proc.once('error',reject);
    proc.once('close', code => code === 0 ? resolve() : reject(unavailable()));
  }).then(() => {
    const auth = credential(JSON.parse(output));
    return exclusive(() => save({generation:randomUUID(),revision:randomUUID(),credential:auth}));
  }).then(() => { current.state='ready'; }, () => { current.state='failed'; })
    .finally(() => { output=''; diagnostic=''; delete current.code; delete current.url; });
  proc.stdin.on('error', () => {}); proc.stdin.end(key === undefined ? undefined : key+'\n');
  if (key !== undefined) { await done; if (current.state !== 'ready') throw unavailable(); }
  return sharedLoginStatus(owner);
}
