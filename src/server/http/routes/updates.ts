import { createConnection } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import type { Route } from '../router.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Ctx } from '../../office/context.js';
import type { UpdateStatus } from '../../../shared/software-updates.js';

const socket = '/run/agent-office-updates.sock';
const busyStatuses = new Set(['working', 'starting', 'needs_input']);
function busy(ctx: Ctx) {
  let count = 0;
  for (const floor of ctx.floors.values()) {
    for (const worker of floor.workers.list()) if (busyStatuses.has(worker.status)) count++;
  }
  return count;
}

export const updateActivity: Route = {
  path: '/api/update-activity', method: 'GET', auth: 'public',
  handle(ctx, { req, res }) {
    const expected = Buffer.from(process.env.AOP_RELEASE_PROBE ?? '');
    const supplied = Buffer.from(String(req.headers['x-office-probe'] ?? ''));
    if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return send(res, 403, {});
    return send(res, 200, { busy: busy(ctx) });
  },
};

export function updateRequest(command: object, path = socket): Promise<Partial<UpdateStatus> & { rejected?: string }> {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ path, allowHalfOpen: true });
    conn.setEncoding('utf8');
    conn.setTimeout(20000, () => conn.destroy(new Error('Update manager timeout')));
    let result = '';
    conn.once('connect', () => conn.end(JSON.stringify(command) + '\n'));
    conn.on('data', chunk => {
      result += chunk;
      if (result.length > 32768) conn.destroy(new Error('Invalid update response'));
    });
    conn.once('error', reject);
    conn.once('end', () => {
      try { resolve(JSON.parse(result)); } catch (err) { reject(err); }
      conn.destroy();
    });
  });
}

export const updatesRoute: Route = {
  path: '/api/software-updates', auth: 'session',
  async handle(ctx, { req, res, session }) {
    if (!ctx.meOf(session.account?.id).admin) return send(res, 403, { error: 'Administrator access required' });
    let command: object = { action: 'status' };
    if (req.method === 'POST') {
      if (!sameOrigin(req, ctx.cfg)) return send(res, 403, {});
      let body;
      try { body = JSON.parse(await readBody(req, 512)); } catch { return send(res, 400, {}); }
      if (body?.action === 'apply' && typeof body.tag === 'string' && /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(body.tag)) command = { action: 'apply', tag: body.tag };
      else if (body?.action === 'channel' && ['stable', 'preview'].includes(body.channel)) command = { action: 'channel', channel: body.channel };
      else if (body?.action === 'check') command = { action: 'check' };
      else return send(res, 400, {});
    } else if (req.method !== 'GET') return send(res, 405, {});
    try {
      const result = await updateRequest(command);
      if (result.rejected) return send(res, 409, { error: result.rejected });
      return send(res, 200, { ...result, busy: busy(ctx) });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' && req.method === 'GET') return send(res, 200, { managed: false, busy: 0 });
      return send(res, 503, { error: 'Gestore aggiornamenti temporaneamente non disponibile.' });
    }
  },
};
