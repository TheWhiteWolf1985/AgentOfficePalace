// Run as the service user on a rootless Docker QA host. Only disposable desks and
// synthetic credentials are used. Supply the released image, seccomp and socket via env.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {docker,dockerHome,dockerPrefix,prepareContainer,stopContainer} from '../dist/server/server/workers/docker.js';
import {sharedAccount,sharedLoginStatus,startSharedLogin,workerCredential} from '../dist/server/server/workers/shared-codex.js';
import {officeWorkers} from '../dist/server/server/hooks/office-workers.js';

const exec=promisify(execFile);
const image=process.env.AGENT_OFFICE_CODEX_IMAGE;
assert.ok(image && process.env.AGENT_OFFICE_DOCKER_SOCKET && process.env.AGENT_OFFICE_CODEX_SECCOMP);
const root=await mkdtemp('/var/tmp/office-shared-login-'), bridge=path.join(root,'bridge'), project=path.join(root,'project');
process.env.AGENT_OFFICE_CODEX_RUNTIME=root;
const workers=new Map();
const server=http.createServer((req,res)=>void officeWorkers({workerFloor:()=>({workers:{authenticate:(id,token)=>{
  const w=workers.get(id);return w && w.token===token ? w.info : undefined;
}}})},req,res,new URL(req.url,'http://localhost'),true).catch(()=>{res.writeHead(500);res.end();}));
function worker(shared=true) {
  const id=randomBytes(6).toString('hex'), token=randomUUID();
  const w={info:{id,runtime:'docker',kind:'agent',sharedCodexLogin:shared || undefined},token};
  workers.set(id,w);return w;
}
async function start(w) {
  const p=await prepareContainer(w.info,project,w.token,['--version']);
  const cid=p.args.at(-1);await docker(['start',cid]);return cid;
}
async function exitedSuccessfully(cid) {
  assert.equal(await docker(['wait',cid],35000),'0');
  assert.match(await docker(['logs',cid]),/codex-cli/);
}
// Supply a deterministic device consent screen in place of contacting a personal
// account. Exercise the real Docker login process, its stderr/stdout boundary and
// browser ownership. The normal CLI image is used for the worker and refresh gates.
async function deviceFlow() {
  const mockBin = path.join(root,'qa-login-bin');
  await mkdir(mockBin);
  await writeFile(path.join(mockBin,'codex'), `#!/bin/sh
set -eu
test "$1" = login && test "$2" = --device-auth || exit 1
printf '%s\\n' 'https://auth.openai.com/codex/device' 'TEST-CODE'
sleep 3
printf '%s\\n' '{"auth_mode":"chatgpt","tokens":{"id_token":"test.e30.test","access_token":"synthetic-access","refresh_token":"synthetic-refresh"}}' > "$CODEX_HOME/auth.json"
`, {mode:0o755});
  const tag = 'aop-qa-device:'+randomUUID();
  const cid = await docker(['create','--network=none',image]);
  let tagged = false;
  try {
    await docker(['cp',mockBin,cid+':/opt/qa-login-bin']);
    await docker(['commit','--change','ENV PATH=/opt/qa-login-bin:/usr/local/bin:/usr/bin:/bin',cid,tag]);
    tagged = true;
    process.env.AGENT_OFFICE_CODEX_IMAGE = tag;
    await startSharedLogin('owner');
    for (let n=0; n<100 && !(await sharedLoginStatus('owner')).code; n++) await delay(100);
    const challenge = await sharedLoginStatus('owner');
    assert.equal(challenge.code,'TEST-CODE');
    assert.equal(challenge.url,'https://auth.openai.com/codex/device');
    assert.deepEqual(await sharedLoginStatus('other-browser'),{account:{method:'api-key'},state:'busy'});
    await assert.rejects(startSharedLogin('other-browser'),/già in corso/);
    for (let n=0; n<100 && (await sharedLoginStatus('owner')).state==='waiting'; n++) await delay(100);
    const approved = await sharedLoginStatus('owner');
    assert.equal(approved.state,'ready');
    assert.equal(approved.code,undefined);
    assert.deepEqual(approved.account,{method:'chatgpt',email:undefined});
    await assert.rejects(startSharedLogin('owner','deliberate-failure'));
    assert.deepEqual(await sharedAccount(),approved.account);
    console.log('Simulated device consent, browser ownership and failed replacement passed');
  } finally {
    process.env.AGENT_OFFICE_CODEX_IMAGE = image;
    await docker(['rm',cid]);
    if (tagged) await docker(['image','rm',tag]);
  }
}
try {
  await mkdir(path.join(bridge,'codex-system'),{recursive:true});await mkdir(project);
  for(const name of ['shared-codex.cjs']) await copyFile(new URL('../bin/'+name,import.meta.url),path.join(bridge,name));
  await copyFile(new URL('../tests/fixtures/shared-codex-refresh.cjs',import.meta.url),path.join(bridge,'check.cjs'));
  server.listen(path.join(bridge,'hooks.sock'));await once(server,'listening');
  const first=worker(), second=worker(), legacy=worker(false);
  const waiting=await start(first);
  assert.equal(await docker(['inspect','-f','{{.State.Running}}',waiting]),'true');
  assert.equal(await sharedAccount(),'signed-out');
  const linked=await startSharedLogin('test-admin','sk-office-test-synthetic');
  assert.deepEqual(linked.account,{method:'api-key'});
  await exitedSuccessfully(waiting);
  await exitedSuccessfully(await start(second));
  const oldHome=dockerHome(legacy.info.id);
  await mkdir(oldHome,{recursive:true});await writeFile(path.join(oldHome,'auth.json'),'{"auth_mode":"apikey","OPENAI_API_KEY":"sk-legacy-synthetic"}');
  await exitedSuccessfully(await start(legacy));
  assert.equal(JSON.parse(await readFile(path.join(oldHome,'auth.json'))).OPENAI_API_KEY,'sk-legacy-synthetic');
  await stopContainer(first.info.id);
  assert.deepEqual(await sharedAccount(),{method:'api-key'});
  console.log('Single CLI sign-in, waiting worker, subsequent worker and legacy account passed');
  await deviceFlow();

  const jwt=(claims)=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.stub';
  const claims={sub:'synthetic',email:'test@example.invalid',exp:Math.floor(Date.now()/1000)+3600,'https://api.openai.com/auth':{chatgpt_account_id:'qa',chatgpt_plan_type:'plus'}};
  const value={generation:randomUUID(),revision:randomUUID(),credential:{auth_mode:'chatgpt',last_refresh:new Date().toISOString(),
    tokens:{id_token:jwt(claims),access_token:jwt({...claims,jti:'before'}),refresh_token:'only-the-master',account_id:'qa'}}};
  const next=jwt({...claims,jti:'after'});let rotations=0;
  await writeFile(path.join(root,'shared-codex/account.json'),JSON.stringify(value),{mode:0o600});
  globalThis.fetch=async (url,req)=>{
    assert.equal(url,'https://auth.openai.com/oauth/token');assert.equal(JSON.parse(req.body).refresh_token,'only-the-master');rotations++;
    return Response.json({access_token:next,refresh_token:'next-master'});
  };
  const snapshot=await workerCredential();
  await Promise.all([first,second].map(async w=>{
    const home=dockerHome(w.info.id);
    await writeFile(path.join(home,'auth.json'),JSON.stringify(snapshot));
    await exec('docker',[...dockerPrefix(),'run','--rm','--network=none','--read-only','--cap-drop=ALL',
      '--tmpfs','/tmp','-w','/tmp','-v',home+':/test-home','-v',bridge+':/office-bridge:ro',
      '-e','HOME=/tmp','-e','CODEX_HOME=/test-home','-e','AGENT_OFFICE_WORKER_ID='+w.info.id,'-e','AGENT_OFFICE_HOOK_TOKEN='+w.token,
      '-e','AGENT_OFFICE_HOOK_SOCKET=/office-bridge/hooks.sock','-e','CODEX_REFRESH_TOKEN_URL_OVERRIDE=http://127.0.0.1:19463/refresh',
      '-e','QA_EXPECTED_ACCESS='+next,'--entrypoint=node',image,'/office-bridge/check.cjs'],{timeout:60000});
  }));
  assert.equal(rotations,1);console.log('Two isolated real Codex app-servers refreshed through one simulated issuer exchange');
} finally {
  await Promise.all([...workers.keys()].map(id=>stopContainer(id)));
  server.close();await rm(root,{recursive:true,force:true});
}
