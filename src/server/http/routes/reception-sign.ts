import { SIGN_LOGO_MAX } from '../../../shared/reception-sign.js';
import { readBody, sameOrigin, send } from '../util.js';
import type { Route } from '../router.js';

export const receptionSignRoute: Route = {
  path: ['/api/reception-sign','/api/reception-sign/logo'], auth:'session',
  async handle(ctx,{req,res,url,path,session}) {
    if (path === '/api/reception-sign/logo') {
      if (req.method !== 'GET') return send(res,405,{error:'Method not allowed'});
      const logo=ctx.receptionSign.logo(url.searchParams.get('id') ?? '');
      if (!logo) return send(res,404,{error:'Logo not found'});
      res.writeHead(200,{'content-type':logo.meta.mime,'content-length':logo.bytes.length,'cache-control':'private, max-age=31536000, immutable','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});
      return res.end(logo.bytes);
    }
    if (req.method === 'GET') return send(res,200,ctx.receptionSign.state());
    if (req.method !== 'POST') return send(res,405,{error:'Method not allowed'});
    if (!ctx.meOf(session.account?.id).admin) return send(res,403,{error:'Administrator access required'});
    if (!sameOrigin(req,ctx.cfg)) return send(res,403,{error:'Forbidden'});
    try {
      const raw=JSON.parse(await readBody(req,Math.ceil(SIGN_LOGO_MAX/3)*4+8192));
      const state=ctx.receptionSign.update(raw);
      ctx.broadcast({t:'reception.sign',state});
      return send(res,200,state);
    } catch(e) {
      const error=e as NodeJS.ErrnoException;
      if (error.code) { console.error('Reception sign save failed:',error.code); return send(res,500,{error:'Could not save the reception sign'}); }
      return send(res,error.message === 'too large' ? 413 : 400,{error:error.message === 'too large' ? 'The logo must be at most 2 MB' : error instanceof SyntaxError ? 'Bad request' : error.message});
    }
  },
};
