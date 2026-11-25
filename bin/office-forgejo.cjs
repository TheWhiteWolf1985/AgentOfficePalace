// This relay lives inside one worker. Only Office knows that worker's Forgejo credential.
const http = require('node:http');
const { once } = require('node:events');
const { constants, createWriteStream } = require('node:fs');
const { copyFile, mkdtemp, open, rm } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');
const git = require('node:util').promisify(execFile);
const port = 19462;
const origin = 'http://127.0.0.1:' + port + '/office.git';
function relay(env, listenPort = port) {
  const server = http.createServer((req, res) => {
    const match = /^\/office\.git\/(?:info\/refs\?service=(git-(?:upload|receive)-pack)|(git-(?:upload|receive)-pack))$/.exec(req.url);
    if (!match || req.method !== (match[1] ? 'GET' : 'POST')) { res.writeHead(404); return res.end(); }
    const query = new URLSearchParams({worker:env.AGENT_OFFICE_WORKER_ID,service:match[1] || match[2]});
    const headers = {authorization:'Bearer ' + env.AGENT_OFFICE_HOOK_TOKEN};
    for (const key of ['content-type','content-encoding','git-protocol']) if (req.headers[key]) headers[key]=req.headers[key];
    const call = http.request({socketPath:env.AGENT_OFFICE_HOOK_SOCKET,method:req.method,path:'/office/workers/git?' + query,headers}, upstream => {
      res.writeHead(upstream.statusCode,{'content-type':upstream.headers['content-type'] || 'text/plain'});
      upstream.on('error', () => res.destroy()); upstream.pipe(res);
    });
    call.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end(); });
    res.once('close', () => call.destroy()); req.pipe(call);
  });
  server.on('error', () => server.close());
  server.listen(listenPort,'127.0.0.1'); server.unref();
  return server;
}
let configuring = Promise.resolve();
function configure(login) {
  const result = configuring.then(() => configureWorkspace(login));
  configuring = result.catch(() => {});
  return result;
}
async function configureWorkspace(login) {
  if (!/^aop-[0-9a-f]{12}-[0-9a-f]{6}$/.test(login)) throw Error('Identità Git non valida');
  const run = (...args) => git('git',['-C','/workspace',...args]);
  const names = (await run('remote')).stdout.trim().split(/\s+/);
  // Preserve origins chosen by a user in an existing workspace.
  const name = names.includes('origin') && (await run('remote','get-url','origin')).stdout.trim() !== origin ? 'office' : 'origin';
  if (!names.includes(name)) await run('remote','add',name,origin);
  else if ((await run('remote','get-url',name)).stdout.trim() !== origin) throw Error('Il remoto office è già occupato');
  await run('config','--local','user.name',login);
  await run('config','--local','user.email',login+'@office.invalid');
  return name;
}

// Git only opens a private bare repository here. Worker-controlled Git configs, hooks,
// remotes and checkouts belong to the sandbox and are never executed by the MCP process.
async function transfer(env, identity, input) {
  const push = input.operation === 'push';
  const branch = input.head ?? identity.defaultBranch;
  if (typeof branch !== 'string' || !branch || branch.length > 255 || branch.startsWith('-') || branch === 'HEAD')
    throw Error('Indicare un branch Git valido');
  if (push && (branch === identity.defaultBranch || typeof input.sha !== 'string' || !/^[0-9a-f]{40}$/.test(input.sha) ||
      typeof input.bundle !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.bundle$/.test(input.bundle)))
    throw Error('Per il push servono branch di lavoro, SHA e nome del bundle in /workspace');
  const ref = 'refs/heads/' + branch;
  const dir = await mkdtemp('/tmp/office-git-');
  const run = (...args) => git('/usr/bin/git', ['-c','core.hooksPath=/dev/null','-c','protocol.allow=never',
    '-c','protocol.http.allow=always','-c','protocol.file.allow=always','-c','fetch.fsckObjects=true', ...args], {
    cwd:dir, timeout:90000, env:{PATH:'/usr/bin:/bin', HOME:dir, GIT_CONFIG_NOSYSTEM:'1',
      GIT_CONFIG_GLOBAL:'/dev/null', GIT_TERMINAL_PROMPT:'0', GIT_NO_REPLACE_OBJECTS:'1', LC_ALL:'C'},
  });
  let server;
  try {
    await run('check-ref-format',ref);
    await run('init','--bare','--template=', '.');
    server = relay(env,0);
    await once(server,'listening');
    const url = 'http://127.0.0.1:' + server.address().port + '/office.git';
    const pack = path.join(dir, 'transfer.bundle');
    if (push) {
      const file = await open(path.join('/workspace',input.bundle), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.nlink !== 1) throw Error('Il bundle deve essere un file regolare del workspace');
        await pipeline(file.createReadStream(), createWriteStream(pack,{flags:'wx',mode:0o600}));
      } finally { await file.close(); }
      // A self-contained bundle needs no download. Resolve incremental prerequisites only from this floor.
      try { await run('bundle','verify',pack); }
      catch {
        const refs = (await run('ls-remote','--heads',url,'refs/heads/'+identity.defaultBranch,ref)).stdout.trim();
        const refspecs = refs.split('\n').filter(Boolean).map(line => line.split('\t')[1])
          .filter(r => r === ref || r === 'refs/heads/' + identity.defaultBranch).map(r => r + ':refs/remotes/office/' + r.slice(11));
        if (refspecs.length) await run('fetch','--no-tags',url,...refspecs);
        await run('bundle','verify',pack);
      }
      await run('fetch','--no-tags',pack,ref + ':' + ref);
      const sha = (await run('rev-parse','--verify',ref + '^{commit}')).stdout.trim();
      if (sha !== input.sha) throw Error('Il commit del bundle non coincide con lo SHA richiesto');
      await run('push','--porcelain',url,ref + ':' + ref);
      return {repository:identity.repository, branch, sha};
    }
    await run('fetch','--no-tags',url,ref + ':' + ref);
    await run('symbolic-ref','HEAD',ref);
    await run('bundle','create',pack,ref,'HEAD');
    const bundle = '/workspace/office-' + randomUUID() + '.bundle';
    await copyFile(pack,bundle,constants.COPYFILE_EXCL);
    const sha = (await run('rev-parse',ref)).stdout.trim();
    return {repository:identity.repository, branch, sha, bundle, login:identity.login,
      email:identity.login+'@office.invalid', usage:'git clone this local bundle into a new directory, or git fetch it in an existing checkout.'};
  } finally {
    if (server) server.close();
    await rm(dir,{recursive:true,force:true});
  }
}
module.exports = { relay, configure, transfer };
