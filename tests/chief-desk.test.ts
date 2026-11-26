import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CHIEF_DESK, DESKS, SEATING_BY_ID, nextFreeSeat } from '../src/shared/layout.js';
import { assignmentDesk, changeOfficeRole, officeRole, restoreChiefDesk } from '../src/server/workers/chief-desk.js';
import { configureWorker } from '../src/server/workers/configure.js';
import type { Worker, WorkerContext } from '../src/server/workers/types.js';
import type { WorkerInfo } from '../src/shared/protocol.js';

const agent = (id: string, deskId = 'desk-1') => ({info:{id,deskId,runtime:'docker',kind:'agent',name:id,color:'#112233',provider:'codex',status:'working'}} as Worker);

test('the chief has a reserved elevated desk even when the ordinary office is full', () => {
  const all = DESKS.map((d,i) => agent(String(i),d.id).info);
  assert.equal(assignmentDesk(all,'chief',undefined,0,()=>undefined),CHIEF_DESK.id);
  assert.equal(nextFreeSeat(()=>false)?.id,'desk-1');
  assert.equal(SEATING_BY_ID.has('boss-chair'),false);
  assert.equal(CHIEF_DESK.y,3);
  assert.throws(()=>assignmentDesk([...all,agent('chief',CHIEF_DESK.id).info],'chief',undefined,0,()=>undefined),/già/);
  const oldChief = agent('chief').info;
  assert.throws(()=>assignmentDesk([oldChief],'chief',undefined,0,()=> 'chief'),/già/);
});

test('existing chiefs migrate in place and restore idempotently without changing other agent data', () => {
  const chief = agent('chief','desk-12'), regular=agent('other','desk-2');
  chief.info.sessionId='preserved-session';
  chief.info.sharedCodexLogin=true;
  const workers=new Map([['chief',chief],['other',regular]]);
  const roleOf=(w:WorkerInfo)=>w.id==='chief' ? 'chief' as const : 'operator' as const;
  assert.equal(restoreChiefDesk(workers,roleOf),true);
  assert.equal(chief.info.deskId,CHIEF_DESK.id);
  assert.equal(chief.info.sessionId,'preserved-session');
  assert.equal(chief.info.status,'working');
  assert.equal(regular.info.deskId,'desk-2');
  assert.equal(restoreChiefDesk(workers,roleOf),false);
  assert.equal(assignmentDesk([...workers.values()].map(w=>w.info),'operator','chief',0,roleOf),'desk-1');
  const unfinished=agent('unfinished',CHIEF_DESK.id), lone=new Map([['unfinished',unfinished]]);
  assert.equal(restoreChiefDesk(lone,()=>undefined),true);
  assert.equal(unfinished.info.deskId,'desk-1');
});

test('role changes move working agents, reserve one chief per floor and enforce the desk on Apply', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(),'chief-placement-'));
  const previous=process.env.AGENT_OFFICE_CODEX_RUNTIME;
  process.env.AGENT_OFFICE_CODEX_RUNTIME=runtime;
  t.after(async()=>{if(previous===undefined)delete process.env.AGENT_OFFICE_CODEX_RUNTIME;else process.env.AGENT_OFFICE_CODEX_RUNTIME=previous;await rm(runtime,{recursive:true,force:true});});
  const a=agent('aabbccddeeff'), b=agent('001122334455','desk-2');
  let persisted=0,emitted=0;
  const ctx={workers:new Map([[a.info.id,a],[b.info.id,b]]),persist:()=>{persisted++;},emit:()=>{emitted++;},applyContainerSettings:()=>{}} as unknown as WorkerContext;
  const floor={id:'test',repo:''};
  const access=await changeOfficeRole(ctx,a.info.id,floor,{role:'chief',tenure:'temporary'},0);
  assert.equal(access.role,'chief');assert.equal(officeRole(a.info),'chief');
  assert.equal(a.info.deskId,CHIEF_DESK.id);assert.equal(a.info.status,'working');
  const changes={name:'Chief',color:'#112233',deskId:'desk-3',provider:'codex' as const};
  await assert.rejects(configureWorker(ctx,a.info.id,changes),/ruolo/);
  await assert.rejects(configureWorker(ctx,b.info.id,{...changes,deskId:CHIEF_DESK.id}),/ruolo/);
  await assert.rejects(changeOfficeRole(ctx,b.info.id,floor,{role:'chief',tenure:'temporary'},0),/già/);
  assert.equal(b.info.deskId,'desk-2');
  await changeOfficeRole(ctx,a.info.id,floor,{role:'supervisor',tenure:'temporary'},0);
  assert.equal(a.info.deskId,'desk-1');
  await changeOfficeRole(ctx,b.info.id,floor,{role:'chief',tenure:'temporary'},0);
  await configureWorker(ctx,b.info.id,{...changes,deskId:CHIEF_DESK.id});
  assert.equal(b.info.name,'Chief');
  assert.equal(persisted,4);assert.equal(emitted,4);
  await assert.rejects(changeOfficeRole(ctx,b.info.id,{...floor,id:'other'}, {role:'operator',tenure:'temporary'},0),/altro piano/);
  assert.equal(b.info.deskId,CHIEF_DESK.id);
  assert.equal(officeRole(b.info),'chief');
  ctx.persist=()=>{throw Error('Simulated disk failure');};
  await assert.rejects(changeOfficeRole(ctx,b.info.id,floor,{role:'operator',tenure:'temporary'},0),/disk failure/);
  assert.equal(officeRole(b.info),'operator');
  assert.equal(b.info.deskId,'desk-2');
});
