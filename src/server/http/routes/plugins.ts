import { TLSSocket } from 'node:tls';
import { googleDriveSignInOrigin } from '../../../shared/google-drive-oauth.js';
import { italianPlugins } from '../../../shared/locales/it-plugins.js';
import { PluginError, pluginCall, startPluginService } from '../../plugin-service.js';
import { tunnelAccount } from '../../tunnel-account.js';
import type { Route } from '../router.js';
import { isSecure, sameOrigin, readBody, send } from '../util.js';

const api = '/api/plugins';
const callback = api + '/callback/';
const callbackHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };

export const pluginsRoute: Route = {
  path: [api, callback + 'drive', callback + 'canva', callback + 'linkedin', callback + 'heygen'], auth: 'session',
  async handle(ctx, { req, res, session, path, url }) {
    if (!ctx.meOf(session.account?.id).admin) return send(res, 403, { error: 'Administrator access required' });
    const returning = path !== api;
    const browser = ctx.auth.pluginBrowserBinding(req);
    if (!browser) return send(res, 401, { error: 'Not logged in' }, callbackHeaders);
    try {
      if (req.method === 'GET' && returning) {
        const id = path.slice(callback.length);
        await pluginCall('admin/finish', { id, browser, receipt: url.searchParams.get('receipt'), state: url.searchParams.get('state'), code: url.searchParams.get('code') });
        res.writeHead(200, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8' })
          .end('Account collegato. Puoi chiudere questa scheda e tornare a Plugin & Skills.');
        return;
      }
      if (req.method === 'GET') {
        try { return send(res, 200, await pluginCall('admin/status', { browser })); }
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
        case 'tunnel-account': {
          try { return send(res, 200, await tunnelAccount(), callbackHeaders); }
          catch { return send(res, 503, { error: 'The tunnel account is not configured. Update or repair this installation.' }, callbackHeaders); }
        }
        case 'prepare-tunnel': {
          if (!['drive', 'heygen', 'canva'].includes(b.id) || googleDriveSignInOrigin(origin.origin) === origin.origin) break;
          const result = await pluginCall('admin/tunnel', { id: b.id, origin: origin.origin, browser });
          return send(res, 200, result);
        }
        case 'cancel-tunnel':
          return send(res, 200, await pluginCall('admin/cancel', { id: b.id, browser }));
        case 'skill': return send(res, 200, await pluginCall('admin/skill', { id: b.id, enabled: b.enabled }));
        case 'disconnect': return send(res, 200, await pluginCall('admin/disconnect', { id: b.id }));
        case 'drive-client': return send(res, 200, await pluginCall('admin/client', { id: 'drive', clientId: b.clientId, secret: b.secret }));
        case 'canva-client': return send(res, 200, await pluginCall('admin/client', { id: 'canva', clientId: b.clientId, secret: b.secret }));
        case 'begin': {
          if (!['drive', 'canva', 'linkedin', 'heygen'].includes(b.id)) break;
          if (['heygen', 'canva'].includes(b.id) && googleDriveSignInOrigin(origin.origin) !== origin.origin) return send(res, 400, { error: 'Prepare the sign-in tunnel first.' });
          if (b.id === 'drive' && googleDriveSignInOrigin(origin.origin) !== origin.origin) {
            return send(res, 400, { error: 'Open Office through localhost or the registered HTTPS domain to sign in with Google.' });
          }
          const path = callback + b.id;
          const app = (b.id === 'canva' || b.id === 'linkedin') ? { clientId: b.clientId, secret: b.secret } : {};
          const result = await pluginCall('admin/begin', { id: b.id, ...app, redirect: origin.origin + path, browser });
          return send(res, 200, result);
        }
      }
      return send(res, 400, { error: 'Unknown operation.' });
    } catch (error) {
      if (returning && error instanceof PluginError && error.message === 'Sign-in expired or belongs to another browser.') {
        res.writeHead(400, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8' })
          .end('Richiesta di accesso non più valida per questa sessione. Torna a Plugin & Skills nel browser in cui hai avviato il collegamento e avvia un nuovo accesso.');
        return;
      }
      if (returning && error instanceof PluginError && error.message === 'Sign-in was cancelled.') {
        res.writeHead(200, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8' })
          .end('Accesso annullato. Puoi chiudere questa scheda e tornare a Plugin & Skills.');
        return;
      }
      if (returning && error instanceof PluginError) {
        const message = Object.hasOwn(italianPlugins, error.message)
          ? italianPlugins[error.message as keyof typeof italianPlugins] : error.message;
        res.writeHead(error.status, { ...callbackHeaders, 'content-type': 'text/plain; charset=utf-8' }).end(message);
        return;
      }
      return send(res, error instanceof PluginError ? error.status : 503,
        { error: error instanceof PluginError ? error.message : 'Plugin & Skills service unavailable.' }, callbackHeaders);
    }
  },
};
