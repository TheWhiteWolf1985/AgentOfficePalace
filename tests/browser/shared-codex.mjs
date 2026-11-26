import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp, rm} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';

let vite, browser, cache;
before(async () => {
  cache=await mkdtemp(path.join(os.tmpdir(),'codex-login-ui-'));
  vite=await createServer({configFile:false,cacheDir:cache,logLevel:'error',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,hmr:false}});
  await vite.listen(); browser=await chromium.launch({channel:'chrome'});
});
after(async()=>{await browser?.close();await vite?.close();if(cache) await rm(cache,{recursive:true,force:true});});

test('administrator can link the installation before its first office and resume a pending device flow',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  let phase='none', account='signed-out', deviceCalls=0, keyCalls=0, reads=0;
  await page.route('**/api/connections*',async route=>{
    if(route.request().method()==='GET') {
      reads++;
      return route.fulfill({json:{admin:true,codexDocker:true,floors:[],accounts:[],servers:[],bindings:[],sharedCodexAccount:account}});
    }
    const p=route.request().postDataJSON();
    assert.equal(p.action,'codex-login'); assert.ok(!p.workerId && !p.floorId);
    if(p.operation==='device'){deviceCalls++;phase='waiting';}
    if(p.operation==='key'){keyCalls++;account={method:'api-key'};phase='ready';}
    return route.fulfill({json:{account,state:phase,...(phase==='waiting'?{url:'https://auth.openai.com/codex/device',code:'TEST-CODE'}:{})}});
  });
  await page.route('**/auth-panel',r=>r.fulfill({contentType:'text/html',body:`<body><script type="module">
    import {agentManagementPanel} from '/src/client/ui/agent-management.ts';
    const actions=document.createElement('div'), panel=agentManagementPanel(actions);
    document.body.append(panel.element,actions);</script></body>`}));
  await page.goto(vite.resolvedUrls.local[0]+'auth-panel');
  await page.getByRole('button',{name:'Connect ChatGPT'}).click();
  await page.getByRole('link',{name:'Open ChatGPT'}).waitFor();
  assert.equal(deviceCalls,1);
  await page.reload();
  await page.getByRole('link',{name:'Open ChatGPT'}).waitFor();
  assert.equal(deviceCalls,1);
  phase='ready';account={method:'chatgpt',email:'qa@example.invalid'};
  await page.getByText('ChatGPT · qa@example.invalid',{exact:true}).waitFor();
  await page.locator('input[type=password]').fill('synthetic-key');
  await page.getByRole('button',{name:'Connect API key'}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status].connection-status')?.textContent==='Operation completed');
  assert.equal(keyCalls,1);assert.ok(reads>=3);assert.equal(await page.locator('input[type=password]').inputValue(),'');
});
