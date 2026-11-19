import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generate } from 'selfsigned';
import { WebSocket, WebSocketServer } from 'ws';
import { VmConsole } from '../src/server/vm-console.js';

test('real serial protocol bridges UTF-8, resize and output; enforces one writer and clears previews on revocation',async t=> {
  const pems=await generate([{name:'commonName',value:'localhost'}],{keySize:2048,days:1,extensions:[{name:'subjectAltName',altNames:[{type:7,ip:'127.0.0.1'}]}]});
  const dir=await mkdtemp(path.join(tmpdir(),'aop-console-'));await writeFile(path.join(dir,'ca.pem'),pems.cert);
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const frames:string[]=[];let remote:WebSocket|undefined,requests=0,allowed=true;
  const backend=https.createServer({cert:pems.cert,key:pems.private},async(req,res)=> {
    assert.equal(req.url,'/api2/json/nodes/proxmox/qemu/112/termproxy');assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'PVEAPIToken=fixture');
    let body='';for await(const data of req)body+=data;assert.equal(body,'serial=serial0');requests++;
    res.setHeader('content-type','application/json');res.end(JSON.stringify({data:{port:'5900',ticket:'private-ticket',user:'console@pve!only-112'}}));
  });
  const pve=new WebSocketServer({noServer:true});backend.on('upgrade',(req,socket,head)=> {
    assert.ok(req.url?.includes('vncticket=private-ticket'));assert.equal(req.headers.authorization,'PVEAPIToken=fixture');
    pve.handleUpgrade(req,socket,head,ws=> {
      remote=ws;ws.on('message',data=> {frames.push(data.toString());if(frames.length===1) {assert.equal(frames[0],'console@pve!only-112:private-ticket\n');ws.send('O');ws.send('K');ws.send('\r\nDebian console\r\nlogin: ');} });
    });
  });
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const service=new VmConsole(()=>({origin:`https://127.0.0.1:${(backend.address() as import('node:net').AddressInfo).port}`,node:'proxmox',vmid:112,token:'PVEAPIToken=fixture',caFile:path.join(dir,'ca.pem')}));
  const server=http.createServer(),wss=new WebSocketServer({server});
  wss.on('connection',ws=>void service.attach(ws,()=>allowed));server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=> {service.stop();for(const ws of wss.clients)ws.terminate();for(const ws of pve.clients)ws.terminate();wss.close();pve.close();server.close();backend.close();});
  const url=`ws://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const client=new WebSocket(url),messages:string[]=[];client.on('message',data=>messages.push(data.toString()));
  await once(client,'open');
  const until=async(check:()=>boolean)=> {for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Timed out waiting for console');};
  await until(()=>messages.some(m=>m.includes('login:')));
  assert.ok(messages.includes('{"type":"ready"}'));assert.equal(messages.some(m=>m.includes('private-ticket')),false);
  client.send(JSON.stringify({type:'input',data:'caffè\r'}));client.send(JSON.stringify({type:'resize',cols:120,rows:35}));
  await until(()=>frames.includes('1:120:35:'));assert.ok(frames.includes('0:7:caffè\r'));
  await until(()=>service.state().lines.some(l=>l.includes('login:')));
  const second=new WebSocket(url);const closeSecond=once(second,'close');await once(second,'open');assert.equal((await closeSecond)[0],4009);assert.equal(requests,1);
  const closeFirst=once(client,'close');allowed=false;remote!.send('must not escape after revocation');await closeFirst;
  assert.equal(messages.some(m=>m.includes('must not escape')),false);assert.deepEqual(service.state(),{configured:true,active:false,lines:[]});
});
