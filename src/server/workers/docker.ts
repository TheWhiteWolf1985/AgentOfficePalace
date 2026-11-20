import { createHash } from 'node:crypto';
import { DropStore } from '../drops.js';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { WorkerInfo } from '../../shared/protocol.js';

const exec = promisify(execFile);
export const AGENT_IMAGE = 'aop-codex:0.171.0';
export const dockerRoot = () => process.env.AGENT_OFFICE_CODEX_RUNTIME;
const socket = () => process.env.AGENT_OFFICE_DOCKER_SOCKET;
const jobs = new Map<string, Promise<unknown>>();
const label = 'io.agentoffice.worker';
const instanceLabel = 'io.agentoffice.instance';
const instance = () => createHash('sha256').update(dockerRoot() ?? '').digest('hex').slice(0, 24);

export function serialWorker<T>(id: string, action: () => Promise<T>): Promise<T> {
  const next = (jobs.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
  jobs.set(id, next);
  const done = () => { if (jobs.get(id) === next) jobs.delete(id); };
  next.then(done, done);
  return next;
}

function paths(id: string) {
  const root = dockerRoot();
  if (!root || !path.isAbsolute(root) || root.includes(',') || !/^[0-9a-f]{12}$/.test(id)) throw Error('Configurazione del runtime Codex non valida');
  const dir = path.join(root, 'workers', id);
  return { dir, home: path.join(dir, 'home'), drops: path.join(root, 'drops', id), work: path.join(dir, 'workspace'), bridge: path.join(root, 'bridge'), name: 'aop-codex-' + id };
}
export const dockerHome = (id: string) => path.join(paths(id).home, '.codex');
export function dockerDrop(id: string, name: string, type: string, body: Buffer) {
  const p = paths(id);
  const file = new DropStore(dockerRoot()!).save(id, name, type, body);
  return file && path.dirname(file) === p.drops ? '/office-drops/' + path.basename(file) : undefined;
}
export function dockerPrefix(): string[] {
  const file = socket();
  if (!file || !path.isAbsolute(file)) throw Error('Socket Docker locale non configurato');
  return ['--host', 'unix://' + file];
}
const cliEnv = () => ({ PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' });
async function docker(args: string[]) {
  try { return (await exec('docker', [...dockerPrefix(), ...args], { env: cliEnv(), timeout: 30000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch (e) {
    // execFile's error message includes argv, including the worker hook token. Only expose the daemon's diagnostic.
    const diagnostic = String((e as {stderr?: string}).stderr || '').trim().split('\n').at(-1);
    throw Error(diagnostic?.replace(/[a-f0-9]{32,}/gi, '…').slice(0, 300) || 'Docker non disponibile');
  }
}
async function owned(id: string) {
  const name = paths(id).name;
  const ids = await docker(['ps', '-a', '--no-trunc', '--filter', 'name=^/' + name + '$', '--format', '{{.ID}}']);
  if (!ids) return;
  if (!/^[a-f0-9]{64}$/.test(ids)) throw Error('Identità container ambigua');
  const state = await docker(['inspect', '--format', '{{index .Config.Labels "' + label + '"}} {{index .Config.Labels "' + instanceLabel + '"}} {{.State.Status}}', ids]);
  const [worker, office, status] = state.split(' ');
  if (worker !== id || office !== instance()) throw Error('Il nome Docker appartiene a un altro container');
  return { cid: ids, status };
}

function checkedDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (realpathSync(dir) !== dir) throw Error('Percorso runtime non valido');
}
// A private checkout has its own Git metadata. The office process, its .agent-office
// state, sibling checkouts and credentials are never mounted in a worker.
async function workspace(id: string, project: string) {
  const p = paths(id);
  checkedDir(p.dir); checkedDir(p.home); checkedDir(dockerHome(id)); checkedDir(p.drops);
  if (existsSync(p.work)) { checkedDir(p.work); return p; }
  const staging = await mkdtemp(path.join(p.dir, '.prepare-'));
  try {
    if (existsSync(path.join(project, '.git'))) {
      await exec('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--no-local', '--no-hardlinks', '--', realpathSync(project), staging], { env: cliEnv(), timeout: 120000 });
      await exec('git', ['-C', staging, 'remote', 'remove', 'origin'], { env: cliEnv() });
    } else {
      // Unversioned offices may contain local-only files. Do not silently substitute an empty checkout.
      if ((await readdir(project)).some(name => name !== '.agent-office')) throw Error('Per importare questo ufficio in Docker, versiona prima i file del progetto in Git');
      await exec('git', ['init', '-q', staging], { env: cliEnv() });
    }
    await rename(staging, p.work);
  } finally { await rm(staging, { recursive: true, force: true }); }
  return p;
}

export async function prepareContainer(info: WorkerInfo, project: string, token: string, args: string[]) {
  const p = await workspace(info.id, project);
  const existing = await owned(info.id);
  let cid = existing?.cid;
  if (existing && !['running', 'created'].includes(existing.status)) {
    await docker(['rm', existing.cid]); cid = undefined;
  }
  if (!cid) {
    const opts = await docker(['info', '--format', '{{json .SecurityOptions}}']);
    if (!opts.includes('"name=rootless"')) throw Error('Il motore degli agenti deve operare in modalità rootless');
    const seccomp = process.env.AGENT_OFFICE_CODEX_SECCOMP;
    if (!seccomp || !path.isAbsolute(seccomp)) throw Error('Profilo sandbox Codex mancante');
    cid = await docker(['create', '--pull=never', '--name', p.name, '--label', label + '=' + info.id, '--label', instanceLabel + '=' + instance(),
      '--init', '-it', '--cap-drop=ALL', '--cap-add=SETFCAP', '--security-opt=no-new-privileges', '--security-opt', 'seccomp=' + seccomp,
      '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m', '--pids-limit=256',
      '--cpus', process.env.AGENT_OFFICE_CODEX_CPUS || '1', '--memory', process.env.AGENT_OFFICE_CODEX_MEMORY || '2g',
      '--mount', 'type=bind,src=' + p.work + ',dst=/workspace',
      '--mount', 'type=bind,src=' + p.home + ',dst=' + p.home,
      '--mount', 'type=bind,src=' + p.drops + ',dst=/office-drops,readonly',
      '--mount', 'type=bind,src=' + p.bridge + ',dst=/office-bridge,readonly',
      '--env', 'HOME=' + p.home, '--env', 'CODEX_HOME=' + dockerHome(info.id),
      '--env', 'TERM=xterm-256color', '--env', 'AGENT_OFFICE_WORKER_ID=' + info.id,
      '--env', 'AGENT_OFFICE_HOOK_TOKEN=' + token, '--env', 'AGENT_OFFICE_HOOK_SOCKET=/office-bridge/hooks.sock',
      AGENT_IMAGE, ...args]);
  }
  if (!/^[a-f0-9]{64}$/.test(cid)) throw Error('Creazione del container non confermata');
  const attach = existing?.status === 'running' ? ['attach', '--sig-proxy=false'] : ['start', '-ai'];
  return { file: 'docker', args: [...dockerPrefix(), ...attach, cid], env: cliEnv(), cwd: p.dir };
}

/** Recover compute left between a floor removal and process shutdown. Only our labelled containers qualify. */
export async function reconcileContainers(registered: (id: string) => boolean) {
  const ids = await docker(['ps', '-a', '--filter', 'label=' + instanceLabel + '=' + instance(),
    '--format', '{{.Label "' + label + '"}}']);
  for (const id of ids.split('\n')) {
    if (/^[0-9a-f]{12}$/.test(id) && !registered(id)) {
      await serialWorker(id, async () => { if (!registered(id)) await stopContainer(id); });
    }
  }
}
export async function stopContainer(id: string) {
  const c = await owned(id);
  if (c?.status === 'running') await docker(['stop', '--time=8', c.cid]);
  if (c) await docker(['rm', c.cid]);
}
export async function retireContainer(id: string) {
  await stopContainer(id);
  devices.delete(id);
  const p = paths(id);
  // Leave the user's independent checkout recoverable, remove the private sign-in on retirement.
  new DropStore(dockerRoot()!).remove(id);
  if (existsSync(p.home)) { checkedDir(p.home); await rm(p.home, { recursive: true, force: true }); }
  return existsSync(p.work) ? p.work : undefined;
}

type DeviceLogin = { state: 'waiting'|'ready'|'failed'; code?: string; url?: string; owner: string };
const devices = new Map<string, DeviceLogin>();
export function deviceState(id: string, owner: string) {
  const v = devices.get(id);
  return v?.owner === owner ? { state: v.state, code: v.code, url: v.url } : { state: 'none' };
}
export async function loginContainer(id: string, owner: string, key?: string) {
  const current = await owned(id);
  if (current?.status !== 'running') throw Error('Avvia prima il container');
  if (key !== undefined && (!key.trim() || key.length > 1024 || /\s/.test(key))) throw Error('Chiave API non valida');
  if (devices.get(id)?.state === 'waiting') throw Error('È già in corso un accesso');
  const device: DeviceLogin = { state: 'waiting', owner };
  devices.set(id, device);
  const proc = spawn('docker', [...dockerPrefix(), 'exec', '--workdir=/tmp', '-i', current.cid, 'codex', 'login', key ? '--with-api-key' : '--device-auth'], { env: cliEnv(), stdio: 'pipe', timeout: key ? 30000 : 15 * 60_000 });
  let text = '';
  const capture = (s: Buffer) => {
    if (key || device.state !== 'waiting') return;
    text = (text + s.toString()).slice(-8192).replace(/\x1b\[[0-9;]*m/g, '');
    const url = text.match(/https:\/\/auth\.openai\.com\/codex\/device\b/)?.[0];
    const code = text.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0];
    if (url && code) Object.assign(device, { url, code });
  };
  proc.stdout.on('data', capture); proc.stderr.on('data', capture);
  const completed = new Promise<boolean>(resolve => {
    proc.on('error', () => resolve(false)); proc.on('close', code => resolve(code === 0));
  }).then(ok => { device.state = ok ? 'ready' : 'failed'; delete device.code; delete device.url; return ok; });
  proc.stdin.on('error', () => {}); proc.stdin.end(key ? key + '\n' : undefined);
  if (key && !await completed) throw Error('Accesso con chiave API non riuscito');
  return deviceState(id, owner);
}
