// The worker talks to an isolated repository over the same HTTP/Unix relay as in Office.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { once } = require('node:events');
const { spawn, execFileSync } = require('node:child_process');
const { transfer } = require('/qa/office-forgejo.cjs');
const base = '/tmp/office-git';
const run = (file, ...args) => execFileSync(file, args, {cwd:'/workspace', encoding:'utf8'}).trim();
const git = (...args) => run('git', ...args);
const tmp = () => fs.readdirSync(base).filter(name => name.startsWith('transfer-'));

async function main() {
  const disk = fs.statfsSync(base);
  assert.equal(disk.type, 0xef53);
  assert.equal(fs.statfsSync('/tmp').type, 0x01021994);
  assert.ok(disk.blocks * disk.bsize <= 4 * 1024 ** 3);
  assert.throws(() => run('fallocate', '-l', '4294967297', base + '/over-limit'), /No space left/);
  fs.rmSync(base + '/over-limit', {force:true});
  run('fallocate', '-l', '2G', base + '/first-operation');
  assert.throws(() => run('fallocate', '-l', '2G', base + '/second-operation'), /No space left/);
  for (const name of ['first-operation','second-operation']) fs.rmSync(base + '/' + name, {force:true});
  console.log('Hard disk capacity limit verified');
  git('init', '-q', '-b', 'main', 'seed');
  run('dd', 'if=/dev/urandom', 'of=seed/data', 'bs=1M', 'count=132', 'status=none');
  git('-C','seed','add','data');
  git('-C','seed','-c','user.name=Test','-c','user.email=test@office.invalid','commit','-qm','Large file');
  git('clone', '-q', '--bare', 'seed', 'remote.git');
  const service = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://local').searchParams.get('service');
    assert.ok(['git-upload-pack','git-receive-pack'].includes(name));
    const advertise = req.method === 'GET';
    res.setHeader('content-type', 'application/x-' + name + (advertise ? '-advertisement' : '-result'));
    if (advertise) {
      const hello = '# service=' + name + '\n';
      res.write((hello.length + 4).toString(16).padStart(4, '0') + hello + '0000');
    }
    const child = spawn('git', [name.slice(4), '--stateless-rpc', ...(advertise ? ['--advertise-refs'] : []), '/workspace/remote.git']);
    child.stdin.on('error', () => {});
    req.pipe(child.stdin); child.stdout.pipe(res); child.stderr.pipe(process.stderr);
  });
  const sock = '/tmp/scratch-qa.sock';
  service.listen(sock); await once(service, 'listening');
  const identity = {repository:'qa/office', defaultBranch:'main', login:'qa'};
  const use = input => transfer({AGENT_OFFICE_HOOK_SOCKET:sock, AGENT_OFFICE_WORKER_ID:'test',AGENT_OFFICE_HOOK_TOKEN:'test'}, identity, input);
  try {
    fs.mkdirSync(base + '/transfer-99999999-1-ABCDEF');
    const stat = fs.readFileSync('/proc/self/stat', 'utf8');
    const active = base + '/transfer-' + process.pid + '-' + stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] + '-ACTIVE';
    fs.mkdirSync(active);
    const received = await use({operation:'checkout'});
    assert.ok(fs.existsSync(active));
    fs.rmdirSync(active);
    assert.ok(fs.statSync(received.bundle).size > 128 * 1024 ** 2);
    assert.equal(received.sha, git('-C','seed','rev-parse','HEAD'));
    git('clone','-q',received.bundle,'copy');
    assert.equal(git('-C','copy','hash-object','data'), git('-C','seed','rev-parse','HEAD:data'));
    git('-C','copy','branch','draft');
    git('-C','copy','bundle','create','/workspace/draft.bundle','draft');
    const push = {operation:'push',head:'draft',sha:received.sha,bundle:'draft.bundle'};
    await assert.rejects(use({...push, sha:'0'.repeat(40)}), /SHA/);
    assert.deepEqual(tmp(), []);
    await use(push);
    assert.equal(git('-C','remote.git','rev-parse','draft'), received.sha);
    assert.deepEqual(tmp(), []);
    console.log('Checkout and push above 128 MiB, hash verification, interrupted and failed transfer cleanup passed');
  } finally { service.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
