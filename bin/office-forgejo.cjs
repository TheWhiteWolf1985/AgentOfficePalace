// This relay lives inside one worker. Only Office knows that worker's Forgejo credential.
const http = require('node:http');
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
module.exports = { relay, configure };
