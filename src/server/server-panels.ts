import http from 'node:http';
import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import type { MachineState } from '../shared/protocol.js';
import type { DockerContainer, ServerPanelState } from '../shared/server-panels.js';

export function linuxAvailable(text: string): number | undefined {
  const match = /^MemAvailable:\s+(\d+)\s+kB\s*$/m.exec(text);
  return match ? Number(match[1]) * 1024 : undefined;
}

/** Only allowlisted fields cross into the browser; inspect/environment values never do. */
export function dockerContainers(raw: unknown): DockerContainer[] {
  if (!Array.isArray(raw) || raw.length > 5000) throw new Error('Invalid Docker response');
  return raw.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.Id !== 'string') throw new Error('Invalid container');
    const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 300) : '';
    const labels = item.Labels ?? {};
    const status = text(item.Status);
    return { id: text(item.Id), name: text(Array.isArray(item.Names) ? item.Names[0] : '').replace(/^\//,''),
      image: text(item.Image), state: text(item.State), status,
      project: text(labels['com.docker.compose.project']) || undefined,
      service: text(labels['com.docker.compose.service']) || undefined,
      health: /\(unhealthy\)/.test(status) ? 'unhealthy' : /\(healthy\)/.test(status) ? 'healthy' : /\(health: starting\)/.test(status) ? 'starting' : undefined };
  }).sort((a,b) => (a.project ?? '').localeCompare(b.project ?? '') || a.name.localeCompare(b.name));
}

export function readDocker(socketPath: string): Promise<ServerPanelState['docker']> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (state: ServerPanelState['docker']) => { if (!settled) { settled = true; resolve(state); } };
    const req = http.get({ socketPath, path: '/containers/json?all=true', timeout: 2000 }, res => {
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2*1024*1024) req.destroy(new Error('Response too large')); else chunks.push(chunk); });
      res.on('error', () => finish({state:'unavailable',containers:[],message:"Docker unreachable"}));
      res.on('end', () => {
        try { if (res.statusCode !== 200) throw new Error(); finish({state:'ready',containers:dockerContainers(JSON.parse(Buffer.concat(chunks).toString()))}); }
        catch { finish({state:'unavailable',containers:[],message:"Docker response unavailable"}); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', (error: NodeJS.ErrnoException) => finish({ state: error.code === 'ENOENT' ? 'missing' : 'unavailable', containers:[],
      message: error.code === 'ENOENT' ? "Docker not configured" : error.code === 'EACCES' ? "Docker monitoring: access not configured" : "Docker unreachable" }));
  });
}

/** One coalesced sample per server, at most every five seconds, only while someone requests it. */
export class ServerPanelMonitor {
  private cached?: ServerPanelState;
  private pending?: Promise<ServerPanelState>;
  private history: [number,number,number][] = [];
  constructor(private machine: () => MachineState,
    private consoleState: () => ServerPanelState['console'],
    private diskPath = process.env.AGENT_OFFICE_METRICS_PATH || '/',
    private dockerSocket = process.env.AGENT_OFFICE_DOCKER_SOCKET || '/var/run/docker.sock') {}

  async state(): Promise<ServerPanelState> {
    if (this.cached && Date.now()-this.cached.at < 5000) return {...this.cached,console:this.consoleState()};
    this.pending ??= this.sample().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async sample(): Promise<ServerPanelState> {
    const sample = this.machine(), at = Date.now(), memTotal = os.totalmem();
    let available = os.freemem();
    if (process.platform === 'linux') {
      try { available = linuxAvailable(await readFile('/proc/meminfo','utf8')) ?? available; } catch { /* OS fallback */ }
    }
    const memUsed = Math.max(0,Math.min(memTotal,memTotal-available));
    const machine: ServerPanelState['machine'] = {cpu:sample.cpu,cores:sample.cores,memTotal,memUsed,history:[]};
    const [,docker] = await Promise.all([
      statfs(this.diskPath).then(s => { machine.disk = {path:this.diskPath,total:s.blocks*s.bsize,used:(s.blocks-s.bfree)*s.bsize,available:s.bavail*s.bsize}; })
        .catch(() => { machine.diskError = "Disk space unavailable"; }),
      readDocker(this.dockerSocket),
    ]);
    this.history.push([at,machine.cpu,memTotal ? Math.round(100*memUsed/memTotal) : 0]);
    this.history = this.history.filter(([time])=>at-time<300_000).slice(-60); machine.history = this.history.slice();
    return this.cached = {at,machine,docker,console:this.consoleState()};
  }
}
