import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { newWorkerName, assertWorkerName, reconcileWorkerNames } from '../src/server/workers/names.js';
import { buildingWorkerNames } from '../src/server/worker-names.js';
import { configureWorker } from '../src/server/workers/configure.js';
import { NAMES } from '../src/server/workers/worker.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Worker, WorkerContext } from '../src/server/workers/types.js';

function worker(id: string, name: string, createdAt = 1): Worker {
  return {info:{id,name,createdAt,kind:'agent',provider:'codex',status:'idle',color:'#112233',deskId:'desk-1'}} as Worker;
}
function context(workers: Worker[], others: Worker[] = []) {
  return {workers:new Map(workers.map(w=>[w.info.id,w])),namePool:()=>others.map(w=>w.info),
    persist(){},emit(){},resume(){},applyContainerSettings(){}} as unknown as WorkerContext;
}

test('hiring and renaming reserve names across floors, including case and Unicode whitespace', () => {
  const pixel=worker('a','Pixel'), ctx=context([], [pixel]);
  assert.equal(newWorkerName(ctx,undefined,'agent'),'Byte');
  assert.equal(newWorkerName(ctx,'Pixel','agent'),'Pixel (2)');
  for(const name of ['Pixel','pixel',' PIXEL ','Ｐｉｘｅｌ'])
    assert.throws(()=>assertWorkerName(ctx,'b',name),/già/);
  assert.doesNotThrow(()=>assertWorkerName(ctx,'a','Pixel'));
  const full=context([],NAMES.map((name,i)=>worker(String(i),name)));
  assert.equal(newWorkerName(full,undefined,'agent'),'Worker');
  full.workers.set('new',worker('new','Worker'));
  assert.equal(newWorkerName(full,undefined,'agent'),'Worker (2)');
});

test('closed floors reserve names and duplicate migration preserves original unique names and agent IDs', async t => {
  const root=await mkdtemp(path.join(os.tmpdir(),'building-names-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const a=worker('a','Pixel',1), b=worker('b','Pixel',2), c=worker('c','Pixel (2)',3);
  const defs=[a,b,c].map(w=>({id:w.info.id,name:w.info.id,dir:path.join(root,w.info.id)}));
  for(const [i,def] of defs.entries()) {
    await mkdir(path.join(def.dir,'.agent-office'),{recursive:true});
    await writeFile(path.join(def.dir,'.agent-office/workers.json'),JSON.stringify([[a,b,c][i].info]));
  }
  const floors=new Map();
  const building={building:{list:()=>defs},floors} as unknown as Pick<Ctx,'building'|'floors'>;
  assert.equal(buildingWorkerNames(building).length,3);
  const ctx=context([b]);ctx.namePool=()=>buildingWorkerNames(building);
  ctx.persist=()=>{};
  reconcileWorkerNames(ctx);
  assert.equal(b.info.name,'Pixel (3)');
  assert.equal(b.info.id,'b');assert.equal(a.info.name,'Pixel');assert.equal(c.info.name,'Pixel (2)');
  await writeFile(path.join(defs[1].dir,'.agent-office/workers.json'),JSON.stringify([b.info]));
  reconcileWorkerNames(ctx);assert.equal(b.info.name,'Pixel (3)');
  assert.throws(()=>assertWorkerName(ctx,'new','Pixel (2)'),/già/);
  const saved=JSON.parse(await readFile(path.join(defs[0].dir,'.agent-office/workers.json'),'utf8'));
  assert.equal(saved[0].name,'Pixel');
});

test('two asynchronous renames cannot claim the same name after a restart wait', async () => {
  const a=worker('a','Pixel'), b=worker('b','Byte'), ctx=context([a,b]);
  b.info.deskId='desk-2';
  for(const w of [a,b]) w.pty={kill(){setTimeout(()=>{w.pty=undefined;},5);}} as Worker['pty'];
  const rename=(w:Worker)=>configureWorker(ctx,w.info.id,{name:'Capo',deskId:w.info.deskId,color:'#112233',provider:'codex',restart:true});
  const results=await Promise.allSettled([rename(a),rename(b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal([a,b].filter(w=>w.info.name==='Capo').length,1);
  assert.notEqual(a.info.name,b.info.name);
});
