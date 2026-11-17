import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';

export const preferencesRoute: Route = {
  path: '/api/preferences', auth: 'session',
  async handle(ctx, { req, res, session, url }) {
    const account = session.account?.id;
    if (!account || !ctx.accounts.get(account)) return send(res, 403, { error: 'Personal preferences require your own account' });
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') return send(res, 200, { account, preferences: ctx.preferences.get(account), sequence: ctx.preferences.sequence(account, url.searchParams.get('device') ?? undefined) });
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req, ctx.cfg)) return send(res, 403, { error: 'Origin not allowed' });
    try {
      const body = JSON.parse(await readBody(req, 16384));
      const mutation = body?.device !== undefined || body?.sequence !== undefined ? { device: body.device, sequence: body.sequence } : undefined;
      const preferences = ctx.preferences.update(account, body, body?.onlyIfEmpty === true, mutation);
      return send(res, 200, { account, preferences, sequence: ctx.preferences.sequence(account, mutation?.device) });
    } catch (error) {
      if (error instanceof SyntaxError) return send(res, 400, { error: 'Invalid preferences' });
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Invalid ')) return send(res, 400, { error: message });
      if (message === 'too large') return send(res, 413, { error: 'Preferences too large' });
      console.error('Could not save personal preferences');
      return send(res, 500, { error: 'Could not save personal preferences' });
    }
  },
};
