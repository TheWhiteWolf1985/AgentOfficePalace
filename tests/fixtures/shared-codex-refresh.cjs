// Runs against the actual Codex binary without network access. Ask app-server to
// rotate credentials and verify its persisted result, not just the HTTP adapter.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {createInterface} = require('node:readline');
const {setTimeout: delay} = require('node:timers/promises');
async function main() {
  const relay=spawn('node',['/office-bridge/shared-codex.cjs','serve'],{stdio:'ignore'});
  let cli;
  try {
    for (let n=0;n<100;n++) {
      try {await fetch('http://127.0.0.1:19463/ready');break;} catch {await delay(50);}
    }
    cli=spawn('codex',['app-server'],{stdio:['pipe','pipe','ignore']});
    const lines=createInterface({input:cli.stdout})[Symbol.asyncIterator]();
    async function call(id,method,params) {
      cli.stdin.write(JSON.stringify({id,method,params})+'\n');
      for (;;) {
        const line=await lines.next(); assert.ok(!line.done);
        const msg=JSON.parse(line.value);
        if(msg.id===id){assert.ok(!msg.error,'Codex rejected '+method);return msg.result;}
      }
    }
    await call(1,'initialize',{clientInfo:{name:'office_qa',version:'1'}});
    cli.stdin.write('{"method":"initialized"}\n');
    await call(2,'getAuthStatus',{refreshToken:true,includeToken:false});
    const auth=JSON.parse(readFileSync(process.env.CODEX_HOME+'/auth.json','utf8'));
    assert.equal(auth.tokens.access_token,process.env.QA_EXPECTED_ACCESS);
    assert.ok(!auth.tokens.refresh_token.includes('master'));
  } finally {cli?.kill();relay.kill();}
}
main().catch(()=>{console.error('Real Codex refresh did not persist the expected credential');process.exitCode=1;});
