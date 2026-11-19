// The loopback-only server for the workers' own calls: their agents' hook events, and the office's
// queue and workers for the board agents and the office-workers command.
import http from 'node:http';
import { connect } from 'node:net';
import { chmodSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeCodexHook } from '../codex.js';
import { dockerRoot } from '../workers/docker.js';
import type { Ctx } from '../office/context.js';
import { readBody, send } from '../http/util.js';
import { officeQueue } from './office-queue.js';
import { officeWorkers } from './office-workers.js';
import { providerHook } from '../providers/index.js';
import type { AgentProvider } from '../../shared/providers.js';

/** Starts the hook server, and says which port it listens on. */
export async function startHookServer(ctx: Ctx): Promise<{ hookServer: http.Server; hookPort: number }> {
  const hookServer = http.createServer(async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      return send(res, 400, {});
    }
    if (url.pathname === '/office/queue') return officeQueue(ctx, req, res, url);
    if (url.pathname === '/office/workers' || url.pathname.startsWith('/office/workers/')) return officeWorkers(ctx, req, res, url);
    // Each provider with hooks has its route, /hooks/<provider> (see providers/).
    const route = url.pathname.startsWith('/hooks/') ? url.pathname.slice('/hooks/'.length) : '';
    const hook = providerHook(route);
    if (req.method !== 'POST' || !hook) return send(res, 404, { ok: false });
    let payload: unknown = {};
    try {
      const body = await readBody(req);
      payload = body ? JSON.parse(body) : {};
    } catch {
      if (hook.strictJson) return send(res, 400, { ok: false });
      // permissive: a bad payload still counts as the event
    }
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const workerId = url.searchParams.get('worker') ?? '';
    const workers = ctx.workerFloor(workerId)?.workers;
    if (!workers) return send(res, 401, {});
    const event = url.searchParams.get('event') ?? '';
    const ok = workers.handleProviderHook(route as AgentProvider, workerId, token, event, payload);
    send(res, ok ? 200 : 401, {});
  });
  // Workers' terminals outlive a restart of the office (see ptys.ts) with this address in their
  // environment, so listen where the last office did when that port is free.
  const hookPortPath = path.join(ctx.cfg.dataDir, 'hook-port');
  const listenHooks = (port: number) =>
    new Promise<void>((resolve, reject) => {
      hookServer.once('error', reject);
      hookServer.listen(port, process.env.AGENT_OFFICE_HOOK_BIND || '127.0.0.1', () => {
        hookServer.off('error', reject);
        resolve();
      });
    });
  let lastHookPort = 0;
  try {
    lastHookPort = Number(readFileSync(hookPortPath, 'utf8')) || 0;
  } catch {
    // first start
  }
  await listenHooks(lastHookPort).catch(() => listenHooks(0));
  const hookPort = (hookServer.address() as { port: number }).port;
  writeFileSync(hookPortPath, String(hookPort), { mode: 0o600 });
  const root = dockerRoot();
  if (root) {
    const bridge = path.join(root, 'bridge'), socket = path.join(bridge, 'hooks.sock');
    mkdirSync(bridge, { recursive: true, mode: 0o700 });
    writeCodexHook(bridge);
    const old = lstatSync(socket, { throwIfNoEntry: false });
    if (old) {
      if (!old.isSocket()) throw Error('Percorso socket hook occupato');
      // A second office must never unlink the first one's live Unix socket.
      const active = await new Promise<boolean>((resolve, reject) => {
        const probe = connect(socket);
        probe.on('connect', () => { probe.destroy(); resolve(true); });
        probe.on('error', (error: NodeJS.ErrnoException) => error.code === 'ECONNREFUSED' || error.code === 'ENOENT' ? resolve(false) : reject(error));
      });
      if (active) throw Error('Runtime Codex già in uso');
      if (lstatSync(socket, { throwIfNoEntry: false })?.ino === old.ino) unlinkSync(socket);
    }
    const local = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url?.split('?')[0] !== '/hooks/codex') return send(res, 404, {});
      hookServer.emit('request', req, res);
    });
    await new Promise<void>((resolve, reject) => { local.once('error', reject); local.listen(socket, resolve); });
    chmodSync(socket, 0o600);
    hookServer.once('close', () => local.close());
  }
  return { hookServer, hookPort };
}
