import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { lstat, mkdir, readFile, readdir, realpath, open } from 'node:fs/promises';
import { constants, type ReadStream } from 'node:fs';
import path from 'node:path';
import { docker, dockerRoot } from './workers/docker.js';
import { binScript } from './workers/process.js';

const unavailable = 'Plugin & Skills service unavailable.';
export class PluginError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Operation = 'admin/status' | 'admin/skill' | 'admin/client' | 'admin/begin' | 'admin/tunnel' | 'admin/cancel' | 'admin/finish' | 'admin/disconnect' | 'worker/list' | 'worker/use' | 'worker/file';

function directory() {
  const root = dockerRoot();
  if (!root || !path.isAbsolute(root) || root.includes(',')) throw new PluginError(503, unavailable);
  return path.join(root, 'plugin-skills');
}

/** The private Unix socket and account data must never enter the directory mounted by workers. */
async function reconcile() {
  const root = directory();
  const entry = binScript('plugin-skills/service.mjs');
  if (!entry) throw Error('Missing Plugin & Skills runtime.');
  const source = path.dirname(entry);
  for (const dir of [root, path.join(root, 'data'), path.join(root, 'socket')]) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (await realpath(dir) !== dir) throw Error('Invalid Plugin & Skills directory.');
  }
  const security = await docker(['info', '--format', '{{json .SecurityOptions}}']);
  if (!security.includes('"name=rootless"')) throw Error('Plugin & Skills requires rootless Docker.');
  const digest = createHash('sha256');
  for (const file of (await readdir(source, { recursive: true })).sort()) {
    if (file === 'Dockerfile' || file.endsWith('.mjs') || file.startsWith('skills/')) {
      const full = path.join(source, file);
      const st = await lstat(full);
      if (st.isDirectory()) continue;
      if (!st.isFile()) throw Error('Invalid Plugin & Skills package.');
      digest.update(file).update('\0').update(createHash('sha256').update(await readFile(full)).digest());
    }
  }
  const tag = 'aop-plugin-skills:' + digest.digest('hex');
  if (!(await docker(['image', 'ls', '-q', '--filter', 'reference=' + tag]))) {
    await docker(['build', '--quiet', '--tag', tag, source], 600_000);
  }
  const image = await docker(['image', 'inspect', '--format', '{{.Id}}', tag]);
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Invalid Plugin & Skills runtime image.');
  const owner = createHash('sha256').update(root).digest('hex').slice(0, 24);
  const name = 'aop-plugins-' + owner;
  const version = createHash('sha256').update(image).update('2').digest('hex');
  const ownerLabel = 'io.agentoffice.plugins';
  const revisionLabel = 'io.agentoffice.plugins-revision';
  const cid = await docker(['ps', '-a', '--no-trunc', '--filter', 'name=^/' + name + '$', '--format', '{{.ID}}']);
  if (cid) {
    if (!/^[a-f0-9]{64}$/.test(cid)) throw Error('Ambiguous Plugin & Skills container.');
    const info = await docker(['inspect', '--format', '{{index .Config.Labels "' + ownerLabel + '"}} {{index .Config.Labels "' + revisionLabel + '"}} {{.State.Running}}', cid]);
    const [owned, current, running] = info.split(' ');
    if (owned !== owner) throw Error('Plugin & Skills container name already in use.');
    if (current === version) {
      if (running !== 'true') await docker(['start', cid]);
      return;
    }
    await docker(['rm', '-f', cid]);
  }
  await docker(['run', '-d', '--pull=never', '--name', name, '--label', ownerLabel + '=' + owner,
    '--label', revisionLabel + '=' + version, '--restart', 'unless-stopped', '--read-only', '--cap-drop=ALL',
    '--cap-add=SETUID', '--cap-add=SETGID', '--security-opt', 'no-new-privileges',
    '--memory', '512m', '--memory-swap', '512m', '--cpus', '1', '--pids-limit', '64',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777',
    '--log-driver', 'local', '--env', 'AOP_PLUGIN_HOST_SOCKET_DIR=' + path.join(root, 'socket'),
    '--mount', 'type=bind,src=' + path.join(root, 'data') + ',dst=/data',
    '--mount', 'type=bind,src=' + path.join(root, 'socket') + ',dst=/run/office',
    image]);
}
let starting: Promise<void> | undefined;
let lastAttempt = 0;
export function startPluginService() {
  if (starting) return starting;
  if (Date.now() - lastAttempt < 15_000) return Promise.resolve();
  lastAttempt = Date.now();
  starting = reconcile().finally(() => { starting = undefined; });
  return starting;
}

type Attachment = { size: number; stream: ReadStream; name: string; options: string };
export function pluginCall(op: Operation, data: object = {}, attachment?: Attachment): Promise<unknown> {
  const socketPath = path.join(directory(), 'socket', 'plugins.sock');
  return new Promise((resolve, reject) => {
    const fail = () => reject(new PluginError(503, unavailable));
    const headers = attachment ? { 'content-type': 'application/octet-stream', 'content-length': attachment.size,
      'x-office-tool': attachment.name, 'x-office-options': attachment.options } : { 'content-type': 'application/json' };
    const req = request({ socketPath, path: '/' + op, method: 'POST', headers,
      signal: AbortSignal.timeout(attachment ? 45_000 : 24_000) }, res => {
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) req.destroy(new Error('Response too large'));
        else chunks.push(chunk);
      });
      res.on('error', fail);
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode === 200) resolve(value);
          else reject(new PluginError(res.statusCode ?? 502, value.error || unavailable));
        } catch { fail(); }
      });
    });
    req.on('error', fail);
    if (attachment) {
      attachment.stream.once('error', () => req.destroy());
      attachment.stream.once('end', () => { if (attachment.stream.bytesRead !== attachment.size) req.destroy(); });
      attachment.stream.pipe(req);
    } else req.end(JSON.stringify(data));
  });
}

/** Forward one regular file belonging to the authenticated worker. Never mount the office in the tool container. */
export async function pluginFile(name: string, args: Record<string, unknown>,
  roots: { workspace?: string; drops?: string; native?: boolean }, call = pluginCall) {
  const { file, ...options } = args;
  const bad = () => new PluginError(400, 'Choose a file in your workspace or your own attachments.');
  if (typeof file !== 'string' || file.length > 2048 || !/^[a-z][a-z0-9.-]{0,90}$/.test(name)) throw bad();
  const encoded = Buffer.from(JSON.stringify(options)).toString('base64url');
  if (encoded.length > 2048) throw new PluginError(400, 'Invalid tool arguments.');
  const locations = [['/office-drops/', roots.drops], ['/workspace/', roots.workspace]];
  if (roots.native) {
    for (const dir of [roots.drops, roots.workspace]) if (dir) locations.push([dir + '/', dir]);
  }
  const match = locations.find(([prefix]) => prefix && file.startsWith(prefix));
  const root = match ? match[1] : roots.workspace;
  const relative = match ? file.slice(match[0]!.length) : file;
  if (!root || /[\\\x00-\x1f]/.test(relative) || relative.split('/').some(p => !p || p.startsWith('.'))) throw bad();
  const target = path.join(root, relative);
  const fd = await (async () => {
    try {
      if (await realpath(target) !== target) throw bad();
      return await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch { throw bad(); }
  })();
  try {
    const stat = await fd.stat();
    if (!stat.isFile() || stat.nlink !== 1 || await realpath('/proc/self/fd/' + fd.fd).catch(() => '') !== target) throw bad();
    if (!stat.size || stat.size > 16 * 1024 * 1024) throw new PluginError(413, 'Files must be between 1 byte and 16 MiB.');
    const stream = fd.createReadStream({ start: 0, end: stat.size - 1 });
    try { return await call('worker/file', {}, { stream, size: stat.size, name, options: encoded }); }
    finally { stream.destroy(); }
  } finally { await fd.close(); }
}
