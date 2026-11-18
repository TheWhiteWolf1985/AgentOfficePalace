import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PersonalPreferencesStore } from '../src/server/personal-preferences.js';
import { preferencesRoute } from '../src/server/http/routes/preferences.js';
import type { Ctx } from '../src/server/office/context.js';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'preferences-snapshot-')), file = path.join(root,'personal-preferences.json');
  const store = new PersonalPreferencesStore(root), device = 'a'.repeat(32);
  let reads = 0, afterRead: (() => void) | undefined;
  const read = fs.readFileSync;
  t.mock.method(fs,'readFileSync', (...args: Parameters<typeof read>) => {
    const value = Reflect.apply(read,fs,args);
    if (args[0] === file) { reads++; afterRead?.(); }
    return value;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); fs.rmSync(root,{recursive:true,force:true}); });
  return {store,file,root,device,reads:()=>reads,reset:()=>{reads=0;},afterRead(fn?: () => void){afterRead=fn;}};
}

test('account snapshot reads once and the next operation observes an external file replacement', t => {
  const f = fixture(t);
  f.store.update('a',{settings:{volume:.2}},false,{device:f.device,sequence:1}); f.reset();
  const replacement = {version:1,accounts:{a:{settings:{volume:.8}},b:{profile:{color:'#abcdef'}}},devices:{a:{[f.device]:9}}};
  f.afterRead(() => fs.writeFileSync(f.file,JSON.stringify(replacement)));
  const first=f.store.snapshot('a',f.device);
  assert.equal(f.reads(),1); assert.equal(first.preferences?.settings?.volume,.2); assert.equal(first.sequence,1);
  f.afterRead(); f.reset();
  const next=f.store.snapshot('a',f.device);
  assert.equal(f.reads(),1); assert.equal(next.preferences?.settings?.volume,.8); assert.equal(next.sequence,9);
  assert.equal(f.store.snapshot('b',f.device).preferences?.profile?.color,'#abcdef');
  assert.equal(f.store.snapshot('b',f.device).sequence,0);
  assert.deepEqual(f.store.snapshot('missing',f.device),{preferences:null,sequence:0});
});

test('save, replay and initialization acknowledgements come from one read without accepting stale writes', t => {
  const f=fixture(t), other='b'.repeat(32);
  f.store.update('a',{settings:{volume:.2}},false,{device:f.device,sequence:2}); f.reset();
  const saved=f.store.updateSnapshot('a',{settings:{volume:.6}},false,{device:f.device,sequence:3});
  assert.equal(f.reads(),1); assert.equal(saved.preferences.settings?.volume,.6); assert.equal(saved.sequence,3);
  const bytes=fs.readFileSync(f.file,'utf8'); f.reset();
  const replay=f.store.updateSnapshot('a',{settings:{volume:.1}},false,{device:f.device,sequence:2});
  assert.equal(f.reads(),1); assert.equal(replay.preferences.settings?.volume,.6); assert.equal(replay.sequence,3);
  assert.equal(fs.readFileSync(f.file,'utf8'),bytes); f.reset();
  const ignored=f.store.updateSnapshot('a',{settings:{volume:.1}},true,{device:other,sequence:10});
  assert.equal(f.reads(),1); assert.equal(ignored.preferences.settings?.volume,.6); assert.equal(ignored.sequence,0);
  assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
  assert.throws(()=>f.store.updateSnapshot('a',{},false,{device:f.device,sequence:0}),/Invalid preference sequence/);
  assert.deepEqual(f.store.snapshot('a','invalid').sequence,0);
});

test('a failed atomic rename preserves the previous preferences and acknowledgement', t => {
  const f=fixture(t);
  f.store.update('a',{settings:{volume:.2}},false,{device:f.device,sequence:1});
  const before=fs.readFileSync(f.file,'utf8');
  t.mock.method(fs,'renameSync',()=>{throw Error('disk failure');}); syncBuiltinESMExports();
  assert.throws(()=>f.store.updateSnapshot('a',{settings:{volume:.8}},false,{device:f.device,sequence:2}),/disk failure/);
  assert.equal(fs.readFileSync(f.file,'utf8'),before);
  assert.equal(f.store.snapshot('a',f.device).sequence,1);
  assert.equal(f.store.snapshot('a',f.device).preferences?.settings?.volume,.2);
});

test('HTTP GET and POST each read the archive once and return coherent preferences and device sequence', async t => {
  const f=fixture(t);
  f.store.update('a',{settings:{volume:.2}},false,{device:f.device,sequence:1});
  const ctx={cfg:{trustProxy:false},accounts:{get:(id:string)=>id==='a'?{id}:undefined},preferences:f.store} as unknown as Ctx;
  const server=http.createServer((req,res)=>{const url=new URL(req.url!,'http://localhost');void preferencesRoute.handle(ctx,{req,res,url,path:url.pathname,session:{account:{id:'a'}} as any});});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>server.close());
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const replacement={version:1,accounts:{a:{settings:{volume:.9}}},devices:{a:{[f.device]:5}}};
  f.reset(); f.afterRead(()=>fs.writeFileSync(f.file,JSON.stringify(replacement)));
  const first=await(await fetch(base+'?device='+f.device)).json();
  assert.equal(f.reads(),1); assert.equal(first.preferences.settings.volume,.2); assert.equal(first.sequence,1);
  f.afterRead(); f.reset();
  const second=await(await fetch(base+'?device='+f.device)).json();
  assert.equal(f.reads(),1); assert.equal(second.preferences.settings.volume,.9); assert.equal(second.sequence,5);
  f.reset();
  const saved=await(await fetch(base,{method:'POST',headers:{Origin:base},body:JSON.stringify({settings:{volume:.4},device:f.device,sequence:6})})).json();
  assert.equal(f.reads(),1); assert.equal(saved.account,'a'); assert.equal(saved.preferences.settings.volume,.4); assert.equal(saved.sequence,6);
});
