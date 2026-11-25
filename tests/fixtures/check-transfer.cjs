// Invoked by forgejo-agent-live in its disposable rootless worker.
const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
const {createInterface} = require('node:readline');
const fs = require('node:fs');
const child = spawn('node',['/office-bridge/office-workers.mjs','mcp'],{stdio:['pipe','pipe','inherit']});
const output = createInterface({input:child.stdout})[Symbol.asyncIterator]();
let id = 0;
async function tool(args, error = false) {
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:'office_repository',arguments:args}})+'\n');
  const reply = JSON.parse((await output.next()).value);
  assert.equal(reply.id,id);
  const text = reply.result.content[0].text;
  assert.equal(!!reply.result.isError,error,text);
  return error ? text : JSON.parse(text);
}
async function main() {
  const copy = await tool({operation:'checkout'});
  const git = (...args) => execFileSync('git',args,{cwd:'/workspace',encoding:'utf8'}).trim();
  git('clone','--quiet',copy.bundle,'copy');
  assert.equal(git('-C','copy','rev-parse','HEAD'),copy.sha);
  git('-C','copy','switch','-c','bundle-test');
  fs.writeFileSync('/workspace/copy/report.md','# Collaudo\n');
  git('-C','copy','add','report.md');
  git('-C','copy','-c','user.name='+copy.login,'-c','user.email='+copy.email,'commit','-m','Collaudo');
  const sha=git('-C','copy','rev-parse','HEAD');
  git('-C','copy','bundle','create','/workspace/out.bundle','bundle-test','^'+copy.sha);
  const push={operation:'push',head:'bundle-test',sha,bundle:'out.bundle'};
  await tool({...push,head:'main'},true);
  await tool({...push,sha:copy.sha},true);
  await tool({...push,bundle:'../out.bundle'},true);
  fs.symlinkSync('/workspace/out.bundle','/workspace/link.bundle');
  await tool({...push,bundle:'link.bundle'},true);
  assert.equal((await tool(push)).sha,sha);
  assert.equal((await tool(push)).sha,sha); // Retry after lost acknowledgement.
  const read = await tool({operation:'checkout',head:'bundle-test'});
  assert.equal(read.sha,sha);
  assert.equal(read.repository,copy.repository);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>child.stdin.end());
