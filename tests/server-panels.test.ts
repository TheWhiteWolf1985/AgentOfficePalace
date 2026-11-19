import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SERVER_PANELS } from '../src/shared/server-panels.js';
import { SERVER_ROOM_DATA } from '../src/shared/server-room.js';
import { dockerContainers, linuxAvailable, readDocker, ServerPanelMonitor } from '../src/server/server-panels.js';
import { consoleInput } from '../src/server/vm-console.js';
import { serverRoomRoute } from '../src/server/http/routes/server-room.js';
import type { Ctx } from '../src/server/office/context.js';
import type { MachineState } from '../src/shared/protocol.js';

test('monitoring boards follow distance from elevator, independent of Blender suffixes',()=> {
  const positions=SERVER_PANELS.map(p=>SERVER_ROOM_DATA.panels.find(s=>s.surface_node===p.surface)!.center_blender_m[0]);
  assert.deepEqual(SERVER_PANELS.map(p=>p.id),['machine','console','docker']);
  assert.ok(positions[0]>positions[1] && positions[1]>positions[2]);
});
test('Linux RAM uses MemAvailable, including reclaimable cache, rather than MemFree',()=> {
  assert.equal(linuxAvailable('MemFree:        1024 kB\nMemAvailable:  8388608 kB\n'),8*1024**3);
  assert.equal(linuxAvailable('MemFree: 1024 kB'),undefined);
});
test('Docker inventory includes stopped/unhealthy services, Compose grouping and no private inspect fields',()=> {
  const result=dockerContainers([{Id:'b',Names:['/second'],Image:'image:tag',State:'exited',Status:'Exited (0) 5 minutes ago',Env:['SECRET=value'],Labels:{'com.docker.compose.project':'office','com.docker.compose.service':'api','secret':'value'}},
    {Id:'a',Names:['/first'],Image:'db',State:'running',Status:'Up 1 hour (unhealthy)'}]);
  assert.equal(result[0].health,'unhealthy');assert.equal(result[1].state,'exited');assert.equal(result[1].service,'api');
  assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(JSON.stringify(result).includes('value'),false);
  assert.throws(()=>dockerContainers({}));
});
test('Docker reader uses only the read inventory endpoint and reports absent/unavailable distinctly',async t=> {
  const socket=process.platform==='win32'?`\\\\.\\pipe\\aop-docker-${randomUUID()}`:path.join(tmpdir(),`aop-docker-${randomUUID()}.sock`);
  const server=http.createServer((req,res)=> { assert.equal(req.method,'GET');assert.equal(req.url,'/containers/json?all=true');res.setHeader('content-type','application/json');res.end('[]'); });
  server.listen(socket);await once(server,'listening');t.after(()=>new Promise<void>(r=>server.close(()=>r())));
  assert.deepEqual(await readDocker(socket),{state:'ready',containers:[]});
  assert.equal((await readDocker(socket+'-absent')).state,'missing');
});
test('all viewers share one pending sample and cached sample; disk failure remains explicit',async()=> {
  let samples=0;
  const monitor=new ServerPanelMonitor(()=>{samples++;return {cpu:12,cores:4} as MachineState;},()=>({configured:false,active:false,lines:[]}),path.join(tmpdir(),'missing-'+randomUUID()),path.join(tmpdir(),'docker-'+randomUUID()));
  const states=await Promise.all(Array.from({length:8},()=>monitor.state()));
  assert.equal(samples,1);assert.ok(states.every(s=>s.at===states[0].at));
  assert.equal(states[0].machine.cpu,12);assert.equal(states[0].machine.disk,undefined);assert.ok(states[0].machine.diskError);
  await monitor.state();assert.equal(samples,1);
});
test('console input accepts UTF-8 text and bounded geometry; rejects malformed/binary-like commands',()=> {
  assert.deepEqual(consoleInput(JSON.stringify({type:'input',data:'caffè\r'})),{data:'caffè\r'});
  assert.deepEqual(consoleInput(JSON.stringify({type:'resize',cols:100,rows:30})),{cols:100,rows:30});
  for(const input of ['not json','null',JSON.stringify({type:'input',data:'x'.repeat(16385)}),JSON.stringify({type:'resize',cols:99999,rows:30}),JSON.stringify({type:'exec',command:'id'})])assert.equal(consoleInput(input),undefined);
});
test('monitoring route enforces administrator authorization server-side before sampling',async()=> {
  let status=0,body='';
  const res={writeHead(code:number){status=code;},end(value:string){body=value;}} as unknown as http.ServerResponse;
  const ctx={meOf:()=>({admin:false})} as unknown as Ctx;
  await serverRoomRoute.handle(ctx,{req:{method:'GET'} as http.IncomingMessage,res,session:{},url:new URL('http://x/api/server-room/status'),path:'/api/server-room/status'});
  assert.equal(status,403);assert.match(body,/Administrator/);
});
