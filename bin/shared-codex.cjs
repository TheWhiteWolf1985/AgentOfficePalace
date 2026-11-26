// Only runs inside a shared-login worker. Its refresh ticket is valid on this Office socket.
const http = require('node:http');
const {mkdir, writeFile, rename, rm} = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');

function request(refresh) {
  return new Promise((resolve,reject) => {
    const req = http.request({socketPath:process.env.AGENT_OFFICE_HOOK_SOCKET,
      path:'/office/workers/codex-auth?worker='+encodeURIComponent(process.env.AGENT_OFFICE_WORKER_ID),
      method:'POST', headers:{authorization:'Bearer '+process.env.AGENT_OFFICE_HOOK_TOKEN,'content-type':'application/json'}}, res => {
      let data='';
      res.setEncoding('utf8').on('data', chunk => {
        data+=chunk;
        if (data.length>128*1024) res.destroy(Error('Credential response too large'));
      });
      res.on('error',reject);
      res.on('end',() => {
        if (res.statusCode === 409 || res.statusCode === 401) return resolve(null);
        if (res.statusCode !== 200) return reject(Error('Office login unavailable'));
        try { resolve(JSON.parse(data)); } catch { reject(Error('Office login unavailable')); }
      });
    });
    req.setTimeout(55_000, () => req.destroy(Error('Office login timed out')));
    req.on('error',reject); req.end(JSON.stringify({refresh}));
  });
}
async function initialize() {
  let announced=false;
  for (;;) {
    const account = await request().catch(() => null);
    if (account) {
      const home=process.env.CODEX_HOME, temp=path.join(home,'.office-login-'+randomUUID());
      await mkdir(home,{recursive:true,mode:0o700});
      try {
        await writeFile(temp,JSON.stringify(account),{mode:0o600,flag:'wx'});
        await rename(temp,path.join(home,'auth.json'));
      } finally { await rm(temp,{force:true}); }
      return;
    }
    if (!announced) console.log('Codex · Impostazioni → Gestione agenti → Accesso Codex condiviso');
    announced=true;
    await delay(3000);
  }
}
function serve() {
  const server=http.createServer(async(req,res) => {
    if (req.method !== 'POST' || req.url !== '/refresh') {res.writeHead(404);return res.end();}
    try {
      let body='';
      for await (const chunk of req) {body+=chunk; if(body.length>4096) throw Error();}
      const grant=JSON.parse(body);
      if (grant.grant_type !== 'refresh_token' || typeof grant.refresh_token !== 'string') {res.writeHead(400);return res.end();}
      const account=await request(grant.refresh_token);
      if (!account?.tokens) {res.writeHead(401);return res.end();}
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify(account.tokens));
    } catch { res.writeHead(503); res.end(); }
  });
  server.listen(19463,'127.0.0.1');
}
if (process.argv[2]==='serve') serve();
else if (process.argv[2]==='init') initialize().catch(() => {console.error('Impossibile preparare l’accesso Codex condiviso');process.exitCode=1;});
