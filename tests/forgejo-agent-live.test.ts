import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { officeWorkers } from '../src/server/hooks/office-workers.js';
import type { Ctx } from '../src/server/office/context.js';
import { repositoryOperation } from '../src/server/worker-repository.js';
import { execFile, execFileSync } from 'node:child_process';
import { assignForge, workerForge, retireForge } from '../src/server/forgejo-agents.js';

test('disposable Forgejo: two private offices, personal identities and protected publication', { skip: !process.env.AOP_TEST_FORGEJO_PASSWORD_FILE }, async t => {
  const url = process.env.AOP_TEST_FORGEJO_URL ?? 'http://127.0.0.1:18964';
  assert.match(url,/^http:\/\/127\.0\.0\.1:\d+$/);
  const admin = 'Basic ' + Buffer.from('roleqa:' + readFileSync(process.env.AOP_TEST_FORGEJO_PASSWORD_FILE!, 'utf8').trim()).toString('base64');
  const nonce = randomBytes(5).toString('hex'), org = 'test-' + nonce;
  async function api(endpoint: string, method='GET', body?: object, auth=admin) {
    const r = await fetch(url + '/api/v1' + endpoint, {method, headers: {authorization:auth,'content-type':'application/json'}, body: body && JSON.stringify(body)});
    const raw = await r.text(); assert.ok(r.ok, method + ' ' + endpoint + ' ' + r.status + ' ' + raw.slice(0,180));
    return raw && JSON.parse(raw);
  }
  const dir = mkdtempSync(path.join(os.tmpdir(),'roles-test-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  process.env.AGENT_OFFICE_CODEX_RUNTIME = dir;
  process.env.AGENT_OFFICE_FLOOR_FORGEJO = path.join(dir,'floor.json');
  process.env.AGENT_OFFICE_FORGEJO_AGENT_ADMIN = path.join(dir,'manager');
  const userToken = await api('/users/roleqa/tokens','POST',{name:'roleqa-'+nonce,scopes:['write:admin','read:user']});
  writeFileSync(process.env.AGENT_OFFICE_FORGEJO_AGENT_ADMIN,userToken.sha1,{mode:0o600});
  await api('/orgs','POST',{username:org,visibility:'private'});
  writeFileSync(process.env.AGENT_OFFICE_FLOOR_FORGEJO,JSON.stringify({url,organization:org,token:(await api('/users/roleqa/tokens','POST',{name:'qa-manager-'+nonce,scopes:['read:user','write:organization','write:repository']})).sha1}),{mode:0o600});
  const repo = await api('/orgs/'+org+'/repos','POST',{name:'documents',private:true,auto_init:true,default_branch:'main'});
  const other = await api('/orgs/'+org+'/repos','POST',{name:'other',private:true,auto_init:true});
  const floor = {id:'docs',repo:repo.full_name,forgejoId:repo.id,name:'Documenti',dir,palette:0,addedAt:Date.now(),addedBy:'QA'};
  const people = new Map();
  const staff = [];
  for (const role of ['operator','operator','operator','operator','operator','operator','supervisor','supervisor','supervisor','chief'] as const) {
    const id = randomBytes(6).toString('hex');
    const v = await assignForge(id,floor,{tenure:'permanent',role});
    assert.equal(v.status,'ready',JSON.stringify(v));
    const agent=workerForge(id,floor);
    people.set(role,{id,agent}); staff.push({id,agent,role});
    assert.equal((await agent.api('')).permissions.admin,false);
    const denied=await fetch(url+'/api/v1/repos/'+other.full_name,{headers:{authorization:agent.gitAuth}});
    assert.ok([401,403,404].includes(denied.status), 'other private repository denied');
  }
  const git = (agent: ReturnType<typeof workerForge>, ...args:string[]) => execFileSync('git', args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:'Authorization: '+agent.gitAuth,GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:''}});
  const op=people.get('operator').agent, lead=people.get('supervisor').agent, chief=people.get('chief').agent;
  git(op,'clone',url+'/'+repo.full_name+'.git','work');
  git(op,'-C','work','switch','-c','draft');
  writeFileSync(path.join(dir,'work','test.md'),'# Documenti\n');
  git(op,'-C','work','add','test.md');
  git(op,'-C','work','-c','user.name=Operatore','-c','user.email=operator@office.invalid','commit','-m','Bozza');
  git(op,'-C','work','push','origin','HEAD:refs/heads/draft');
  assert.throws(()=>git(op,'-C','work','push','origin','HEAD:refs/heads/main'));
  assert.throws(()=>git(op,'ls-remote',url+'/'+other.full_name+'.git'));
  const pull={title:'Pubblicazione',head:'draft',base:'main'};
  await assert.rejects(op.api('/pulls','POST',pull));
  const pr=await lead.api('/pulls','POST',pull);
  const sha=git(op,'-C','work','rev-parse','HEAD').trim();
  await assert.rejects(lead.api('/pulls/'+pr.number+'/merge','POST',{Do:'merge',head_commit_id:sha}));
  await chief.api('/pulls/'+pr.number+'/reviews','POST',{event:'APPROVED',commit_id:sha,body:'Controllato'});
  await assert.rejects(lead.api('/pulls/'+pr.number+'/merge','POST',{Do:'merge',head_commit_id:sha}));
  await chief.api('/pulls/'+pr.number+'/merge','POST',{Do:'merge',head_commit_id:sha});
  assert.equal((await chief.api('/pulls/'+pr.number)).merged,true);
  // The office chief opens the final publication. A lead reviews the exact commit.
  git(op,'-C','work','switch','-c','publish');
  writeFileSync(path.join(dir,'work','test.md'),'# Documenti\n\nVersione per revisione.\n');
  const commit = (message:string) => git(op,'-C','work','-c','user.name=Operatore','-c','user.email=operator@office.invalid','commit','-am',message);
  commit('Revisione');
  git(op,'-C','work','push','origin','HEAD:refs/heads/publish');
  const final=await repositoryOperation(people.get('chief').id,floor,{operation:'open',title:'Documento finale',head:'publish'});
  const operatorId = people.get('operator').id;
  await assert.rejects(repositoryOperation(operatorId,floor,{operation:'open',title:'Negata',head:'publish'}));
  const sock = process.platform === 'win32' ? path.win32.join(String.raw`\\.\pipe`, 'aop-forge-' + nonce) : path.join(dir,'git.sock');
  const ctx={workerFloor:(id:string)=> id===operatorId ? {def:floor,workers:{
    authenticate:(key:string,token:string)=>key===id && token==='test' ? {id,runtime:'docker'} : undefined
  }} : undefined } as unknown as Ctx;
  const bridge=createServer((req,res)=>{
    void officeWorkers(ctx,req,res,new URL(req.url!,'http://localhost'),true);
  });
  bridge.listen(sock); await once(bridge,'listening'); t.after(()=>bridge.close());
  const loop = createRequire(import.meta.url)('../bin/office-forgejo.cjs').relay({AGENT_OFFICE_WORKER_ID:operatorId,AGENT_OFFICE_HOOK_SOCKET:sock,AGENT_OFFICE_HOOK_TOKEN:'test'},0);
  await once(loop,'listening'); t.after(()=>loop.close());
  const remote='http://127.0.0.1:'+loop.address().port+'/office.git';
  const gitViaOffice=(...args:string[])=>promisify(execFile)('git',args,{cwd:dir,timeout:15000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  assert.match((await gitViaOffice('ls-remote',remote)).stdout,/refs\/heads\/draft/);
  await gitViaOffice('-C','work','push',remote,'HEAD:refs/heads/redazione');
  await assert.rejects(gitViaOffice('-C','work','push',remote,'HEAD:refs/heads/main'));
  // On the Debian gate also run the shipped MCP command and Git inside the actual rootless image.
  if (process.env.AOP_TEST_DOCKER_SOCKET) {
    const docker=['--host', 'unix://'+process.env.AOP_TEST_DOCKER_SOCKET];
    const image=process.env.AOP_TEST_AGENT_IMAGE || 'aop-codex:0.171.0';
    const command = `set -eu
git init -q /workspace
node /office-bridge/office-workers.mjs mcp < /tmp/mcp-in > /tmp/mcp-out &
mcp=$!
exec 3>/tmp/mcp-in
printf '%s\\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"office_repository","arguments":{"operation":"info"}}}' >&3
for i in $(seq 1 100); do grep -q gitRemote /tmp/mcp-out && break; sleep 0.1; done
grep -q gitRemote /tmp/mcp-out
git -C /workspace fetch -q origin main
git -C /workspace push -q origin FETCH_HEAD:refs/heads/docker-qa
printf '%s\\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"office_repository","arguments":{"operation":"open","head":"docker-qa","title":"Negata"}}}' >&3
for i in $(seq 1 100); do grep -q 'Operatore' /tmp/mcp-out && break; sleep 0.1; done
grep -q 'Operatore' /tmp/mcp-out
exec 3>&-
wait "$mcp"
`;
    const asset=path.resolve('bin');
    await promisify(execFile)('docker',[...docker,'run','--rm','--pull=never','--read-only','--network=none','--cap-drop=ALL',
      '--tmpfs','/tmp','--tmpfs','/workspace','-v',asset+'/office-workers.js:/office-bridge/office-workers.mjs:ro',
      '-v',asset+'/office-forgejo.cjs:/office-bridge/office-forgejo.cjs:ro','-v',sock+':/office-bridge/hooks.sock:ro',
      '-e','AGENT_OFFICE_HOOK_SOCKET=/office-bridge/hooks.sock','-e','AGENT_OFFICE_WORKER_ID='+operatorId,'-e','AGENT_OFFICE_HOOK_TOKEN=test',
      '--entrypoint','/bin/sh',image,'-c','mkfifo /tmp/mcp-in; '+command],{timeout:60000});
  }
  const route='/pulls/'+final.number;
  const first=git(op,'-C','work','rev-parse','HEAD').trim();
  await lead.api(route+'/reviews','POST',{event:'APPROVED',commit_id:first,body:'Verificato'});
  writeFileSync(path.join(dir,'work','test.md'),'# Documenti\n\nVersione corretta.\n');
  commit('Correzione');
  git(op,'-C','work','push','origin','HEAD:refs/heads/publish');
  const revised=git(op,'-C','work','rev-parse','HEAD').trim();
  await assert.rejects(chief.api(route+'/merge','POST',{Do:'merge',head_commit_id:first}));
  await assert.rejects(chief.api(route+'/merge','POST',{Do:'merge',head_commit_id:revised}));
  for (let i=0;i<40;i++) {
    const reviews=await lead.api(route+'/reviews');
    if (reviews.some((r:{dismissed:boolean})=>r.dismissed)) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  await repositoryOperation(staff[6].id,floor,{operation:'approve',number:final.number,sha:revised,body:'Analisi completata'});
  await repositoryOperation(staff[7].id,floor,{operation:'approve',number:final.number,sha:revised,body:'Revisione editoriale completata'});
  await assert.rejects(repositoryOperation(staff[7].id,floor,{operation:'merge',number:final.number,sha:revised}));
  await repositoryOperation(people.get('chief').id,floor,{operation:'merge',number:final.number,sha:revised});
  const temp = randomBytes(6).toString('hex');
  assert.equal((await assignForge(temp,floor,{role:'chief',tenure:'temporary'})).username,undefined);
  assert.throws(()=>workerForge(temp,floor));
  const demoted = await assignForge(people.get('chief').id,floor,{role:'operator',tenure:'permanent'});
  assert.equal(demoted.status,'ready',JSON.stringify(demoted)); assert.equal(demoted.username,chief.login);
  await assert.rejects(chief.api(''));
  await retireForge(people.get('operator').id);
  assert.throws(()=>workerForge(people.get('operator').id,floor));
  assert.throws(()=>git(op,'ls-remote',url+'/'+repo.full_name+'.git'));
});
