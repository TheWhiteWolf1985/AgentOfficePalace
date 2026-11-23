import { randomBytes } from 'node:crypto';
import { TLSSocket } from 'node:tls';
import { parseCookies } from '../../auth.js';
import { googleDriveSignInOrigin } from '../../../shared/google-drive-oauth.js';
import { PluginError, pluginCall, startPluginService } from '../../plugin-service.js';
import type { Route } from '../router.js';
import { isSecure, sameOrigin, readBody, send } from '../util.js';

const api = '/api/plugins';
const callback = api + '/callback/';
const tunnelCookie = 'aop_auth_flow';
const callbackHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };

export const pluginsRoute: Route = {
  path: [api, callback + 'drive', callback + 'canva'], auth: 'session',
  async handle(ctx, { req, res, session, path, url }) {
    if (!ctx.meOf(session.account?.id).admin) return send(res, 403, { error: 'Administrator access required' });
    const returning = path !== api;
    const cookies = parseCookies(req.headers.cookie);
    try {
      if (req.method === 'GET' && returning) {
        const id = path.slice(callback.length);
        const tunneled = url.searchParams.has('receipt');
        const cookieName = tunneled ? tunnelCookie : 'aop_plugin_' + id;
        const browser = cookies[cookieName];
        if (!browser) return send(res, 400, { error: 'Sign-in expired or belongs to another browser.' }, callbackHeaders);
        await pluginCall('admin/finish', { id, browser, receipt: url.searchParams.get('receipt'), state: url.searchParams.get('state'), code: url.searchParams.get('code') });
        res.writeHead(200, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8',
          'Set-Cookie': cookieName + '=; HttpOnly; SameSite=Lax; Path=' + (tunneled ? api : path) + '; Max-Age=0' })
          .end('Account collegato. Puoi chiudere questa scheda e tornare a Plugin & Skills.');
        return;
      }
      if (req.method === 'GET') {
        try { return send(res, 200, await pluginCall('admin/status', { browser: cookies[tunnelCookie] })); }
        catch (error) {
          if (error instanceof PluginError && error.status === 503) void startPluginService().catch(() => {});
          throw error;
        }
      }
      if (req.method !== 'POST' || returning) return send(res, 405, { error: 'Method not allowed' });
      if (!sameOrigin(req, ctx.cfg)) return send(res, 403, { error: 'Invalid request origin' });
      const origin = new URL(req.headers.origin!);
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
      const tls = isSecure(req, ctx.cfg) || (req.socket instanceof TLSSocket && req.socket.encrypted) ||
        (local && req.headers['x-forwarded-proto'] === 'https');
      if (!(origin.protocol === 'https:' && tls) && !(local && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
        return send(res, 400, { error: 'Open Office over HTTPS to manage plugins.' });
      }
      let b;
      try { b = JSON.parse(await readBody(req, 32768)); } catch { return send(res, 400, { error: 'Invalid request.' }); }
      switch (b?.action) {
        case 'prepare-tunnel': {
          if (b.id !== 'drive' || googleDriveSignInOrigin(origin.origin) === origin.origin) break;
          const browser = randomBytes(32).toString('base64url');
          const result = await pluginCall('admin/tunnel', { id: b.id, origin: origin.origin, browser });
          return send(res, 200, result, { 'set-cookie': tunnelCookie + '=' + browser + '; Path=' + api + '; HttpOnly; Secure; SameSite=Lax; Max-Age=600' });
        }
        case 'cancel-tunnel':
          return send(res, 200, await pluginCall('admin/cancel', { id: b.id, browser: cookies[tunnelCookie] }),
            { 'set-cookie': tunnelCookie + '=; Path=' + api + '; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
        case 'skill': return send(res, 200, await pluginCall('admin/skill', { id: b.id, enabled: b.enabled }));
        case 'disconnect': return send(res, 200, await pluginCall('admin/disconnect', { id: b.id }));
        case 'drive-client': return send(res, 200, await pluginCall('admin/client', { id: 'drive', clientId: b.clientId, secret: b.secret }));
        case 'begin': {
          if (b.id !== 'drive' && b.id !== 'canva') break;
          if (b.id === 'drive' && googleDriveSignInOrigin(origin.origin) !== origin.origin) {
            return send(res, 400, { error: 'Open Office through localhost or the registered HTTPS domain to sign in with Google.' });
          }
          const browser = randomBytes(32).toString('base64url');
          const path = callback + b.id;
          const app = b.id === 'canva' ? { clientId: b.clientId, secret: b.secret } : {};
          const result = await pluginCall('admin/begin', { id: b.id, ...app, redirect: origin.origin + path, browser });
          return send(res, 200, result, { 'set-cookie': 'aop_plugin_' + b.id + '=' + browser + '; Path=' + path +
            '; HttpOnly; SameSite=Lax; Max-Age=600' + (origin.protocol === 'https:' ? '; Secure' : '') });
        }
      }
      return send(res, 400, { error: 'Unknown operation.' });
    } catch (error) {
      if (returning && error instanceof PluginError && error.message === 'Sign-in was cancelled.') {
        res.writeHead(200, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8' })
          .end('Accesso annullato. Puoi chiudere questa scheda e tornare a Plugin & Skills.');
        return;
      }
      return send(res, error instanceof PluginError ? error.status : 503,
        { error: error instanceof PluginError ? error.message : 'Plugin & Skills service unavailable.' }, callbackHeaders);
    }
  },
};
