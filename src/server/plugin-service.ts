import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { AGENT_IMAGE, docker, dockerRoot } from './workers/docker.js';
import { binScript } from './workers/process.js';

const unavailable = 'Plugin & Skills service unavailable.';
export class PluginError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Operation = 'admin/status' | 'admin/skill' | 'admin/client' | 'admin/begin' | 'admin/finish' | 'admin/disconnect' | 'worker/list' | 'worker/use';

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
  const image = await docker(['image', 'inspect', '--format', '{{.Id}}', process.env.AGENT_OFFICE_CODEX_IMAGE || AGENT_IMAGE]);
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Invalid Plugin & Skills runtime image.');
  const owner = createHash('sha256').update(root).digest('hex').slice(0, 24);
  const name = 'aop-plugins-' + owner;
  const revision = createHash('sha256').update(source).update(image).update('1');
  const entries = await readdir(path.join(source, 'skills'), { withFileTypes: true });
  const files = ['service.mjs', 'providers.mjs', ...entries.filter(e => e.isDirectory()).map(e => 'skills/' + e.name + '/SKILL.md').sort()];
  for (const file of files) {
    revision.update(file);
    try { revision.update(await readFile(path.join(source, file))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !file.startsWith('skills/')) throw error;
    }
  }
  const version = revision.digest('hex');
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
    '--security-opt', 'no-new-privileges', '--memory', '192m', '--cpus', '0.5', '--pids-limit', '64',
    '--log-driver', 'local', '--mount', 'type=bind,src=' + source + ',dst=/app,readonly',
    '--mount', 'type=bind,src=' + path.join(root, 'data') + ',dst=/data',
    '--mount', 'type=bind,src=' + path.join(root, 'socket') + ',dst=/run/office',
    '--entrypoint', 'node', image, '/app/service.mjs']);
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

export function pluginCall(op: Operation, data: object = {}): Promise<unknown> {
  const socketPath = path.join(directory(), 'socket', 'plugins.sock');
  return new Promise((resolve, reject) => {
    const fail = () => reject(new PluginError(503, unavailable));
    const req = request({ socketPath, path: '/' + op, method: 'POST', headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(24_000) }, res => {
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
    req.end(JSON.stringify(data));
  });
}
