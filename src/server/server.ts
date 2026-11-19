import http from 'node:http';
import https from 'node:https';
import { ensureSelfSigned, type Config } from './config.js';
import { resolveCommand } from './workers.js';
import type { Ctx } from './office/context.js';
import { messaging } from './office/messaging.js';
import { createCore } from './office/core.js';
import { floorHelpers, openFloors } from './office/floors.js';
import { createLateServices, createServices } from './office/services.js';
import { people } from './office/people.js';
import { navigation } from './office/navigation.js';
import { gates } from './office/gates.js';
import { startTimers } from './office/timers.js';
import { findPublicDir } from './http/static.js';
import { requestHandler } from './http/router.js';
import { routes } from './http/routes/index.js';
import { dockerRoot, reconcileContainers } from './workers/docker.js';
import { startHookServer } from './hooks/server.js';
import { acceptWebSockets } from './ws/upgrade.js';
import { stopServerRoom } from './http/routes/server-room.js';

/** What a test can set about how the office starts: the client bundle it serves, instead of the built one. */
export interface StartOptions {
  publicDir?: string;
}

export async function startServer(cfg: Config, opts: StartOptions = {}) {
  if (cfg.httpsPort !== undefined && !cfg.httpsTls) await ensureSelfSigned(cfg);
  const publicDir = opts.publicDir ?? findPublicDir();
  // Everything the office's parts share (see office/context.ts), filled in a stage at a time in the
  // order the office has always started up in: the hook server already answers the workers still
  // running from the last office while the floors open.
  const ctx = {} as Ctx;
  Object.assign(ctx, messaging(ctx), floorHelpers(ctx), people(ctx), navigation(ctx), gates(ctx));
  Object.assign(ctx, createCore(ctx, cfg, publicDir));
  const { hookServer, hookPort } = await startHookServer(ctx);
  Object.assign(ctx, createServices(ctx));
  Object.assign(ctx, await openFloors(ctx, hookPort));
  Object.assign(ctx, createLateServices(ctx));
  if (dockerRoot()) void reconcileContainers(id => !!ctx.workerFloor(id)).catch(error => console.warn('Docker workers:', error.message));

  // --- HTTP ------------------------------------------------------------------------------------
  const handler = requestHandler(ctx, routes);
  const server = cfg.tls ? https.createServer({ cert: cfg.tls.cert, key: cfg.tls.key }, handler) : http.createServer(handler);

  const secureServer = cfg.httpsPort !== undefined && cfg.httpsTls ? https.createServer(cfg.httpsTls, handler) : undefined;

  // --- WebSocket -------------------------------------------------------------------------------
  acceptWebSockets(ctx, server);
  if (secureServer) acceptWebSockets(ctx, secureServer);
  const stopTimers = startTimers(ctx);

  const { services } = ctx;

  /** With `keep` (a restart), workers' terminals keep running for the next office to pick up. */
  const shutdown = (keep = false) => {
    stopTimers();
    ctx.cancelFloorsChanged();
    services.stop();
    ctx.webhook.stop();
    ctx.machine.stop();
    stopServerRoom(ctx);
    ctx.sky.stop();
    for (const f of ctx.floors.values()) f.shutdown(keep);
    ctx.building.shutdown(keep);
    ctx.ledger.flush();
    ctx.conferenceWhiteboard.flush();
    ctx.limits.close();
    for (const a of ctx.accountLimits.values()) a.reader.close();
    ctx.signins.shutdown();
    for (const c of ctx.clients.values()) c.ws.close();
    server.close();
    secureServer?.close();
    hookServer.close();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject); server.listen(cfg.port, cfg.host, resolve);
    });
    if (secureServer) await new Promise<void>((resolve, reject) => {
      secureServer.once('error', reject); secureServer.listen(cfg.httpsPort!, cfg.host, resolve);
    });
    if (secureServer) cfg.httpsPort = (secureServer.address() as import('node:net').AddressInfo).port;
    if (secureServer) ctx.auth.setSecureSibling((server.address() as import('node:net').AddressInfo).port, cfg.httpsPort!);
    services.start();
  } catch (error) { shutdown(); throw error; }

  /** A link (path and fragment) that signs one browser in, once; see Auth.linkKey. */
  const signInLink = () => `/login#key=${ctx.auth.linkKey()}`;

  return {
    server,
    secureServer,
    shutdown,
    accounts: ctx.accounts,
    publicDir,
    hookPort,
    signInLink,
    floors: () => [...ctx.floors.values()],
    projectsDir: () => ctx.building.projectsDir,
    resolvedAgent: resolveCommand(cfg.agentCmd),
  };
}
