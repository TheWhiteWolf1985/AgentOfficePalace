import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
const exec = promisify(execFile);

for (const fail of [false, true]) test('plugin transport never uses a legacy live socket while reconciliation ' + (fail ? 'fails' : 'is pending'),
  { skip: process.platform === 'win32' }, async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pr-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const fixture = path.join(dir, 'readiness.mjs');
    const module = pathToFileURL(path.resolve('src/server/plugin-service.ts')).href;
    await writeFile(fixture, `
      import assert from 'node:assert/strict';
      import http from 'node:http';
      import {mkdir} from 'node:fs/promises';
      import {registerHooks} from 'node:module';
      import {setTimeout as delay} from 'node:timers/promises';
      const root=${JSON.stringify(dir + '/runtime')};
      globalThis.fixtureRuntime=root;
      let ready=false,legacyCalls=0,requests=0;
      globalThis.fixtureDocker=async args=>{
        if(args[0]==='info')return '["name=rootless"]';
        if(args[0]==='image'&&args[1]==='ls')return 'existing-image';
        if(args[0]==='image'&&args[1]==='inspect')return 'sha256:'+'a'.repeat(64);
        if(args[0]==='ps')return '';
        if(args[0]==='run'){await delay(250);if(${fail})throw Error('daemon unavailable');ready=true;return 'a'.repeat(64);}
        throw Error('Unexpected docker operation');
      };
      registerHooks({resolve(specifier,context,next){
        if(specifier==='./workers/docker.js')return {url:'data:text/javascript,'+encodeURIComponent('export const dockerRoot=()=>globalThis.fixtureRuntime;export const docker=(args)=>globalThis.fixtureDocker(args);'),shortCircuit:true};
        return next(specifier,context);
      }});
      await mkdir(root+'/plugin-skills/socket',{recursive:true});
      const server=http.createServer((req,res)=>{let text='';req.setEncoding('utf8').on('data',c=>text+=c).on('end',()=>{requests++;if(!ready&&JSON.parse(text).name?.startsWith('canva.'))legacyCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready}));});});
      await new Promise(resolve=>server.listen(root+'/plugin-skills/socket/plugins.sock',resolve));
      try{
        const {pluginCall}=await import(${JSON.stringify(module)});
        if(${fail}){
          await assert.rejects(pluginCall('worker/use',{name:'canva.copy-design'}),/daemon unavailable/);
          await assert.rejects(pluginCall('worker/use',{name:'canva.copy-design'}),/unavailable/);
          assert.equal(requests,0);
          const drive=await pluginCall('worker/use',{name:'drive.search'});
          assert.equal(drive.ready,false,'An available read-only Drive service is independent of the Canva upgrade gate');
        }else{
          const result=await pluginCall('worker/use',{name:'canva.copy-design'});
          assert.equal(result.ready,true);assert.equal(requests,1);
        }
        assert.equal(legacyCalls,0);console.log('LEGACY_SOCKET_NOT_USED');
      }finally{await new Promise(resolve=>server.close(resolve));}
    `);
    const result = await exec(process.execPath, ['--import', 'tsx', fixture], { cwd: process.cwd(), timeout: 20000 });
    assert.match(result.stdout, /LEGACY_SOCKET_NOT_USED/);
  });
