import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { workerCredential, sharedAccount, sharedLoginStatus, startSharedLogin, SharedLoginExpired } from '../src/server/workers/shared-codex.js';
import { officeWorkers } from '../src/server/hooks/office-workers.js';
import { connectionsRoute } from '../src/server/http/routes/connections.js';
import type { Ctx } from '../src/server/office/context.js';

test('one installation owns the refresh, including concurrent workers, retries and account replacement', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(),'codex-identity-'));
  const old = process.env.AGENT_OFFICE_CODEX_RUNTIME;
  process.env.AGENT_OFFICE_CODEX_RUNTIME = root;
  t.after(async () => { if (old === undefined) delete process.env.AGENT_OFFICE_CODEX_RUNTIME; else process.env.AGENT_OFFICE_CODEX_RUNTIME=old; await rm(root,{recursive:true,force:true}); });
  assert.equal(await sharedAccount(),'signed-out');
  assert.equal(await workerCredential(),undefined);
  await assert.rejects(startSharedLogin('admin','   '),/Chiave API/);
  const dir = path.join(root,'shared-codex'), file = path.join(dir,'account.json');
  await mkdir(dir);
  const value = {generation:randomUUID(),revision:randomUUID(),credential:{auth_mode:'chatgpt',tokens:{
    access_token:'before', id_token:'test.'+Buffer.from('{"email":"qa@example.invalid"}').toString('base64url')+'.test',
    refresh_token:'master-only', account_id:'qa'}}};
  await writeFile(file,JSON.stringify(value));
  assert.deepEqual(await sharedAccount(),{method:'chatgpt',email:'qa@example.invalid'});
  assert.ok(!JSON.stringify(await sharedLoginStatus('admin')).includes('master-only'));
  const initial = await workerCredential();
  assert.ok(initial && 'tokens' in initial);
  const ticket = initial.tokens.refresh_token;
  assert.ok(!JSON.stringify(initial).includes('master-only'));
  let fail = true;
  const rotate = t.mock.method(globalThis,'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url,'https://auth.openai.com/oauth/token');
    assert.equal(JSON.parse(String(options.body)).refresh_token,'master-only');
    return fail ? new Response('',{status:503}) : Response.json({access_token:'next',refresh_token:'rotated-master'});
  });
  await assert.rejects(workerCredential(ticket));
  assert.deepEqual(await workerCredential(),initial);
  fail = false;
  const results = await Promise.all(Array.from({length:10},() => workerCredential(ticket)));
  assert.equal(rotate.mock.callCount(),2);
  for (const r of results) {
    assert.deepEqual(r,results[0]); assert.ok(r && 'tokens' in r);
    assert.equal(r.tokens.access_token,'next'); assert.notEqual(r.tokens.refresh_token,ticket);
    assert.ok(!JSON.stringify(r).includes('rotated-master'));
  }
  assert.equal(JSON.parse(await readFile(file,'utf8')).credential.tokens.refresh_token,'rotated-master');
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777,0o600);
  await writeFile(file,JSON.stringify({...value,generation:randomUUID(),credential:{auth_mode:'apikey',OPENAI_API_KEY:'synthetic-key'}}));
  await assert.rejects(workerCredential(ticket),SharedLoginExpired);
  assert.equal(rotate.mock.callCount(),2);
  assert.deepEqual(await sharedAccount(),{method:'api-key'});
  await writeFile(file,'{"sensitive-invalid-credential":');
  await assert.rejects(sharedAccount(), {message:'Accesso Codex condiviso non disponibile'});
});

test('shared credentials require an authenticated shared Docker worker on the private socket', async t => {
  const ctx = {workerFloor:() => ({workers:{authenticate:(id: string, token: string) => token === 'test-only' &&
    {id,runtime:id==='host'?undefined:'docker',sharedCodexLogin:id!=='legacy'}}})} as unknown as Ctx;
  const app = http.createServer((req,res) => {
    const url=new URL(req.url!,'http://localhost');
    void officeWorkers(ctx,req,res,url,req.headers['x-test-transport']==='socket');
  });
  app.listen(0,'127.0.0.1'); await once(app,'listening');
  t.after(() => {app.closeAllConnections(); app.close();});
  const port=(app.address() as {port:number}).port;
  const request=(id:string,token:string,socket:boolean,body:object={}) => fetch('http://127.0.0.1:'+port+'/office/workers/codex-auth?worker='+id,
    {method:'POST',headers:{authorization:'Bearer '+token,'x-test-transport':socket?'socket':'http'},body:JSON.stringify(body)});
  assert.equal((await request('shared','wrong',true)).status,401);
  assert.equal((await request('shared','test-only',false)).status,403);
  assert.equal((await request('legacy','test-only',true)).status,403);
  assert.equal((await request('host','test-only',true)).status,403);
  assert.equal((await request('shared','test-only',true,{refresh:123})).status,400);
});

test('management rejects non-administrators and foreign origins before any login starts', async t => {
  const app=http.createServer((req,res) => {
    const ctx={cfg:{},meOf:()=>({admin:req.headers['x-test-admin']==='yes'})} as unknown as Ctx;
    void connectionsRoute.handle(ctx,{req,res,session:{},url:new URL(req.url!,'http://localhost')} as Parameters<typeof connectionsRoute.handle>[1]);
  });
  app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(()=>{app.closeAllConnections();app.close();});
  const url='http://127.0.0.1:'+(app.address() as {port:number}).port;
  for(const [admin,origin] of [['no',url],['yes','https://other.invalid']]) {
    const response=await fetch(url+'/api/connections',{method:'POST',headers:{origin,'x-test-admin':admin},
      body:JSON.stringify({action:'codex-login',operation:'device'})});
    assert.equal(response.status,403);
  }
});
