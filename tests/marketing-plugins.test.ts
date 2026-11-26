import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heygenClient } from '../bin/plugin-skills/heygen.mjs';
import { begin, exchange, identity, invoke, operations } from '../bin/plugin-skills/providers.mjs';

const mcp = 'https://mcp.heygen.com/mcp/v1/';
const issuer = 'https://auth.heygen.com';
const redirect = 'http://127.0.0.1:4600/api/plugins/callback/heygen';

test('HeyGen registers an Office callback only once, binds PKCE and exchanges public-client tokens', async t => {
  const registrations: string[][] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL | string, opts: RequestInit) => {
    assert.equal(opts.redirect, 'error');
    switch (String(url)) {
      case mcp: return new Response(null, {status:401, headers:{'WWW-Authenticate':'Bearer resource_metadata="https://mcp.heygen.com/resource"'}});
      case 'https://mcp.heygen.com/resource': return Response.json({resource:mcp, authorization_servers:[issuer], scopes_supported:['mcp']});
      case issuer + '/.well-known/oauth-authorization-server': return Response.json({issuer, authorization_endpoint:issuer+'/auth', token_endpoint:issuer+'/token', registration_endpoint:issuer+'/reg', scopes_supported:['mcp','offline_access']});
      case issuer+'/reg':
        registrations.push(JSON.parse(String(opts.body)).redirect_uris); return Response.json({client_id:'office-client'});
      case issuer+'/token': {
        const body = opts.body as URLSearchParams;
        assert.equal(body.get('resource'), mcp);assert.equal(body.get('client_id'),'office-client');assert.equal(body.has('client_secret'),false);
        return Response.json({access_token:'fixture-token',expires_in:3600,refresh_token:'fixture-refresh'});
      }
      default: throw Error('Unexpected destination');
    }
  });
  const client = await heygenClient(redirect);
  const {url, verifier, state} = begin('heygen', client.clientId, redirect, client);
  const authorization = new URL(url);
  assert.equal(authorization.origin, issuer);assert.equal(authorization.searchParams.get('state'),state);
  assert.equal(authorization.searchParams.get('resource'),mcp);assert.equal(authorization.searchParams.get('scope'),'mcp offline_access');
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  assert.equal((await exchange('heygen', client, {grant_type:'authorization_code',code:'fixture',code_verifier:verifier,redirect_uri:redirect})).access,'fixture-token');
  await heygenClient(redirect,client);assert.deepEqual(registrations, [[redirect]]);
  await heygenClient('https://office.example.org/return',client);assert.deepEqual(registrations, [[redirect], ['https://office.example.org/return']]);
});

test('HeyGen discovery refuses an unrelated issuer before client registration', async t => {
  t.mock.method(globalThis,'fetch',async (url:URL) => {
    assert.equal(url.origin, 'https://mcp.heygen.com');
    if (url.href===mcp) return new Response(null,{status:405});
    return Response.json({resource:mcp,authorization_servers:['https://example.invalid']});
  });
  await assert.rejects(heygenClient(redirect),/Invalid HeyGen OAuth metadata/);
});

for (const sse of [false,true]) test('HeyGen checks the session and tool list without executing a tool ('+(sse?'SSE':'JSON')+')', async t => {
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch', async (url: URL, opts: RequestInit) => {
    assert.equal(url.href,mcp);const headers = new Headers(opts.headers);assert.equal(headers.get('Authorization'),'Bearer fixture');
    if (opts.method==='DELETE') {calls.push('close');return new Response(null,{status:204});}
    const msg=JSON.parse(String(opts.body));calls.push(msg.method);
    if(msg.method==='initialize') return Response.json({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}}}},{headers:{'Mcp-Session-Id':'session'}});
    assert.equal(headers.get('Mcp-Session-Id'),'session');
    if(msg.method==='notifications/initialized') return new Response(null,{status:202});
    assert.equal(msg.method,'tools/list');
    const reply={jsonrpc:'2.0',id:2,result:{tools:[{name:'create_video'}]}};
    return sse ? new Response('event: message\r\ndata: '+JSON.stringify(reply)+'\r\n\r\n',{headers:{'Content-Type':'text/event-stream'}}) : Response.json(reply);
  });
  assert.deepEqual(await invoke('heygen.status',{},'fixture'),{connected:true,provider:'HeyGen'});
  assert.deepEqual(calls,['initialize','notifications/initialized','tools/list','close']);
  await assert.rejects(invoke('heygen.create_video',{},'fixture'),/Tool unavailable/);
});

test('LinkedIn exposes only the connected account and accepts access without refresh',async t=>{
  t.mock.method(globalThis,'fetch', async (url:URL|string,opts:RequestInit)=>{
    if(String(url)==='https://www.linkedin.com/oauth/v2/accessToken')return Response.json({access_token:'linked',expires_in:3600});
    assert.equal(new Headers(opts.headers).get('authorization'),'Bearer fixture');
    if(String(url)==='https://api.linkedin.com/v2/userinfo')return Response.json({sub:'id',name:'Marta',email:'not-returned@example.invalid'});
    throw Error('Unexpected provider request');
  });
  const {url}=begin('linkedin','client','https://office.example.org/api/plugins/callback/linkedin');
  assert.equal(new URL(url).searchParams.get('scope'),'openid profile');
  const token=await exchange('linkedin',{kind:'oauth',clientId:'client',secret:'secret'},{grant_type:'authorization_code',code:'ok'});
  assert.equal(token.refresh,undefined);
  assert.equal(await identity('linkedin','fixture'),'Marta');
  assert.deepEqual(await invoke('linkedin.profile',{},'fixture'),{id:'id',name:'Marta'});
  await assert.rejects(invoke('canva.profile',{},'fixture'),/Tool unavailable/);
  assert.equal(operations.some((tool:{name:string})=>tool.name==='linkedin.publish'),false);
});
