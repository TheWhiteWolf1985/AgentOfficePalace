import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('Canva broker migration, shared MCP access, refresh, isolation and one-time tunnel', { skip: process.platform === 'win32' }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cm-'));
  const socket = path.join(dir, 'plugins.sock'), store = path.join(dir, 'accounts.json');
  await writeFile(store, JSON.stringify({ version: 1, accounts: {
    canva: { kind: 'oauth', clientId: 'client', secret: 'fixture-secret', access: 'old-rest-token', refresh: 'old-rest-refresh', label: 'Old REST account', expires: Date.now() + 3600000 },
    drive: { kind: 'oauth', access: 'drive-fixture', expires: Date.now() + 3600000 },
  }, skills: { 'revisione-markdown': true } }));
  const preload = path.join(dir, 'provider.mjs');
  await writeFile(preload, `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync, appendFileSync } from 'node:fs';
    const log = new URL('./calls', import.meta.url);
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url), endpoint = 'https://api.canva.com/connect/v1/mcp';
      const fault = existsSync(new URL('./fault', import.meta.url)) ? readFileSync(new URL('./fault', import.meta.url), 'utf8') : '';
      assert.equal(options.redirect, 'error');
      if (target.includes('oauth-protected-resource')) return Response.json({resource:endpoint,authorization_servers:['https://www.canva.com'],scopes_supported:['profile:read','design:content:write']});
      if (target.includes('oauth-authorization-server')) return Response.json({issuer:'https://www.canva.com',authorization_endpoint:'https://www.canva.com/api/oauth/authorize',token_endpoint:'https://api.canva.com/auth/v1/oauth/token',code_challenge_methods_supported:['S256']});
      if (target === 'https://api.canva.com/auth/v1/oauth/token') {
        const b = options.body;
        assert.equal(new Headers(options.headers).get('authorization'),'Basic '+Buffer.from('client:fixture-secret').toString('base64'));
        assert.equal(b.get('resource'),endpoint);
        appendFileSync(log,b.get('grant_type')+'\\n');
        if (b.get('code') === 'cancelled') return Response.json({error:'invalid_grant'},{status:400});
        if (b.get('code') === 'no-refresh') return Response.json({access_token:'no-refresh',expires_in:3600});
        return Response.json({access_token:'mcp-fixture',refresh_token:'refresh-fixture',expires_in:b.get('grant_type')==='authorization_code'?1:3600});
      }
      if (target.startsWith('https://www.googleapis.com/drive/v3/files')) return Response.json({files:[]});
      assert.equal(target,endpoint,'No legacy Canva REST calls');
      if(options.method==='DELETE')return new Response(null,{status:204});
      if(fault==='offline')throw Error('unavailable');
      if(fault==='unauthorized')return new Response(null,{status:401});
      assert.equal(new Headers(options.headers).get('authorization'),'Bearer mcp-fixture');
      const msg=JSON.parse(options.body);
      if(msg.method==='notifications/initialized')return new Response(null,{status:202});
      const tools=[{name:'search-designs',description:'Search',inputSchema:{type:'object',properties:{query:{type:'string'}}}},
        {name:'generate-design',description:'Generate',inputSchema:{type:'object',properties:{prompt:{type:'string'}}}},
        ...['search-folders','list-folder-items','move-item-to-folder','copy-design','create-design','get-create-design-async-job'].map(name=>({name,inputSchema:{type:'object',properties:{}}}))];
      globalThis.fixtureCanvaMembers ??= new Set(['Dinside']);
      const payload = msg.params?.name === 'search-folders' ? {folders:[{id:'Ftest',name:'AI_MARKETING'}]} :
        msg.params?.name === 'list-folder-items' ? {items:[...globalThis.fixtureCanvaMembers].map(id=>({type:'design',design:{id}}))} :
        msg.params?.name === 'copy-design' ? {design:{id:'Dnew'}} :
        msg.params?.name === 'create-design' ? {job_id:'JOBasync',continuation_token:'fixture-continuation',status:'pending',polling_policy:{wait_seconds:1}} :
        msg.params?.name === 'get-create-design-async-job' ? {job_id:'JOBasync',status:'completed',design:{id:'Dasync'}} : {operation:msg.params?.name};
      if(msg.params?.name==='move-item-to-folder')globalThis.fixtureCanvaMembers.add(msg.params.arguments.item_id);
      if(msg.method==='tools/call')appendFileSync(new URL('./calls.tools',import.meta.url),msg.params.name+'\\n');
      const result=msg.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}}}:msg.method==='tools/list'?{tools}:
        {content:[{type:'text',text:JSON.stringify(payload)}],structuredContent:payload,isError:false};
      return Response.json({jsonrpc:'2.0',id:msg.id,result});
    };
  `);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'bin/plugin-skills/service.mjs'], {
    env: { ...process.env, AOP_PLUGIN_DATA_DIR: dir, AOP_PLUGIN_SOCKET: socket }, stdio: 'ignore',
  });
  const exited = once(child, 'exit');
  t.after(async () => { child.kill(); await exited; await rm(dir, { recursive: true, force: true }); });
  const call = (op: string, input: object = {}) => new Promise<{ status: number; data: any }>((resolve, reject) => {
    const req = http.request({ socketPath: socket, path: '/' + op, method: 'POST' }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(Buffer.concat(chunks).toString()) }));
    }); req.on('error', reject); req.end(JSON.stringify(input));
  });
  for (let n = 0; ; n++) {
    try { await call('admin/status'); break; } catch (e) { if (n >= 120 || child.exitCode !== null) throw e; await delay(25); }
  }
  const status = async () => (await call('admin/status', { browser: 'admin' })).data.providers.find((p: any) => p.id === 'canva');
  const login = { id: 'canva', browser: 'admin', redirect: 'https://office.example.org/api/plugins/callback/canva' };
  const start = async () => {
    const result = await call('admin/begin', login); assert.equal(result.status, 200);
    return { ...login, state: new URL(result.data.url).searchParams.get('state'), code: 'good' };
  };

  await t.test('legacy REST tokens require reconnect without affecting Drive, skills or saved client credentials', async () => {
    assert.equal((await status()).status, 'reconnect'); assert.equal((await status()).hasClient, true);
    assert.match((await status()).clientIssue, /Reconnect Canva/);
    const catalogue = (await call('worker/list')).data;
    assert.deepEqual(catalogue.tools.map((t: any) => t.name), ['drive.search', 'drive.read']);
    assert.equal(catalogue.skills.length, 1);
    assert.equal((await call('worker/use', { name: 'canva.search-designs' })).status, 409);
    for (const secret of ['https://example.invalid', '••••secret', 'client'])
      assert.equal((await call('admin/client', { id: 'canva', secret })).status, 400);
    assert.equal((await call('admin/client', { id: 'canva', clientId: '', secret: 'fixture-secret' })).status, 200);
    assert.doesNotMatch(JSON.stringify((await call('admin/status')).data), /fixture-secret|old-rest-token|old-rest-refresh/);
  });
  await t.test('the initiating browser must finish a single-use consent and refresh must be granted', async () => {
    const flow = await start();
    assert.equal((await call('admin/finish', { ...flow, browser: 'other' })).status, 400);
    assert.equal((await call('admin/finish', { ...flow, state: 'wrong' })).status, 400);
    assert.equal((await call('admin/finish', { ...flow, code: 'no-refresh' })).status, 400);
    assert.equal((await status()).status, 'reconnect');
    const second = await start();
    assert.equal((await call('admin/finish', second)).status, 200);
    assert.equal((await call('admin/finish', second)).status, 400);
    assert.equal((await status()).status, 'connected');
    assert.equal((await status()).account, 'Canva MCP');
  });
  await t.test('all workers discover reads while unconfigured and refresh remains serialized', async () => {
    const lists = await Promise.all([call('worker/list'), call('worker/list'), call('worker/list')]);
    for (const list of lists) {
      assert.equal(list.status, 200);
      assert.equal(list.data.tools.find((t: any) => t.name === 'canva.search-designs').inputSchema.type, 'object');
      assert.equal(list.data.tools.some((t: any) => t.name === 'canva.generate-design'), false);
      assert.equal(list.data.tools.some((t: any) => t.name === 'canva.profile'), false);
    }
    const grants = (await readFile(path.join(dir, 'calls'), 'utf8')).trim().split('\n');
    assert.equal(grants.filter(g => g === 'refresh_token').length, 1);
    const created = await call('worker/use', { name: 'canva.generate-design', arguments: { prompt: 'Fictitious demo' }, caller: {worker:'iris',floor:'marketing'} });
    assert.equal(created.status, 409); assert.equal(created.data.code, 'canva_tool_not_allowed');
    assert.equal((await call('worker/use', { name: 'canva.arbitrary-method', caller:{worker:'iris',floor:'marketing'} })).status, 409);
    assert.doesNotMatch(JSON.stringify(lists), /fixture-secret|mcp-fixture|refresh-fixture/);
  });
  await t.test('the real broker applies administrative policy and automatically finalizes creations', async () => {
    const actor = {worker:'iris',floor:'marketing'};
    assert.equal((await call('worker/use',{name:'canva.copy-design',arguments:{design_id:'Doutside'},caller:actor})).status,409);
    assert.equal((await call('admin/policy',{folderId:'Ftest',folderName:'AI_MARKETING'})).status,200);
    const result=await call('worker/use',{name:'canva.copy-design',arguments:{design_id:'Doutside'},caller:actor});
    assert.equal(result.status,200);assert.equal(result.data.office_creation.status,'completed');
    assert.equal((await call('worker/use',{name:'canva.move-item-to-folder',arguments:{item_id:'Doutside',to_folder_id:'Ftest'},caller:actor})).status,409);
    assert.equal((await call('worker/use',{name:'canva.search-designs'})).status,409,'Caller identity cannot be omitted');
    const log=await readFile(path.join(dir,'calls.tools'),'utf8');assert.equal(log.split('\n').filter(x=>x==='copy-design').length,1);
    assert.equal(log.split('\n').filter(x=>x==='move-item-to-folder').length,1);
    assert.equal((await status()).policy.folderId,'Ftest');
  });
  await t.test('the shared service completes asynchronous creation without another agent prompt', async () => {
    const created=await call('worker/use',{name:'canva.create-design',arguments:{brief:'asynchronous fixture'},caller:{worker:'iris',floor:'marketing'}});
    assert.equal(created.status,200);assert.equal(created.data.office_creation.status,'creating');
    const deadline=Date.now()+15000;
    while((await status()).policy.pending.length && Date.now()<deadline)await delay(100);
    assert.equal((await status()).policy.pending.length,0);
    const log=await readFile(path.join(dir,'calls.tools'),'utf8');
    assert.equal(log.split('\n').filter(x=>x==='create-design').length,1);
    assert.equal(log.split('\n').filter(x=>x==='get-create-design-async-job').length,1);
    assert.equal(log.split('\n').filter(x=>x==='move-item-to-folder').length,2);
  });
  await t.test('a Canva outage leaves Drive and local skills usable and is reported explicitly', async () => {
    await writeFile(path.join(dir, 'fault'), 'offline');
    // A failed new sign-in cannot overwrite the working account.
    assert.equal((await call('admin/finish', await start())).status, 503);
    assert.equal((await status()).status, 'connected');
    const list = (await call('worker/list')).data;
    assert.equal(list.tools.some((t: any) => t.name === 'drive.search'), true);
    assert.equal(list.unavailable[0].provider, 'canva');
    assert.equal((await call('worker/use', { name: 'drive.search' })).status, 200);
    await rm(path.join(dir, 'fault'));
  });
  await t.test('the reusable tunnel binds Canva callback, Office browser and receipt and closes after use', async () => {
    const result = await call('admin/tunnel', { id: 'canva', browser: 'admin', origin: 'https://192.0.2.5' });
    assert.equal(result.status, 200);
    const local = new URL(result.data.url);
    assert.equal(local.origin + local.pathname, 'http://127.0.0.1:4600/api/plugins/callback/canva');
    assert.equal((await call('admin/tunnel', { id: 'canva', browser: 'other', origin: 'https://192.0.2.5' })).status, 409);
    const file = (await readdir(dir)).find(f => f.startsWith('auth-'))!;
    const forward = (url: URL) => new Promise<URL>((resolve, reject) => {
      const req = http.get({ socketPath: path.join(dir, file), path: url.pathname + url.search, headers: { host: url.host } }, res => {
        res.resume(); if (res.statusCode !== 303) return reject(Error('Expected redirect')); resolve(new URL(res.headers.location!));
      }); req.on('error', reject);
    });
    const authorization = await forward(local);
    const callback = new URL(authorization.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorization.searchParams.get('state')!); callback.searchParams.set('code', 'good');
    const back = await forward(callback);
    assert.equal(back.origin, 'https://192.0.2.5');
    const finish = { id: 'canva', browser: 'admin', receipt: back.searchParams.get('receipt') };
    assert.equal((await call('admin/finish', { ...finish, browser: 'other' })).status, 400);
    assert.equal((await call('admin/finish', finish)).status, 200);
    assert.equal((await call('admin/finish', finish)).status, 400);
    assert.equal((await readdir(dir)).some(f => f.startsWith('auth-')), false);
  });
  await t.test('disconnect removes access for every worker and retains the application configuration', async () => {
    assert.equal((await call('admin/disconnect', { id: 'canva' })).status, 200);
    assert.equal((await status()).status, 'disconnected'); assert.equal((await status()).hasClient, true);
    assert.equal((await call('worker/use', { name: 'canva.search-designs' })).status, 409);
    const saved = JSON.parse(await readFile(store, 'utf8'));
    assert.equal(saved.accounts.canva, undefined); assert.equal(saved.clients.canva.clientId, 'client');
    assert.equal(saved.accounts.drive.access, 'drive-fixture');
  });
});
