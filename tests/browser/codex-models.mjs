import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
let vite,browser,cache;
before(async()=>{
  cache=await mkdtemp(path.join(os.tmpdir(),'office-model-picker-'));
  vite=await createServer({configFile:false,cacheDir:cache,logLevel:'error',optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,hmr:false}});
  await vite.listen();browser=await chromium.launch({channel:'chrome'});
});
after(async()=>{await browser?.close();await vite?.close();if(cache)await rm(cache,{recursive:true,force:true});});

async function open(page) {
  await page.route('**/models-panel',r=>r.fulfill({contentType:'text/html',body:`<body><style>.hidden{display:none!important}</style><script type="module">
    import {agentFields} from '/src/client/ui/provider.ts';
    window.fields=agentFields({defaultProvider:'codex',agentProviders:['codex']},'test',{provider:'codex',model:'gpt-6.1-terra',effort:'high'});
    document.body.append(fields.element);
    </script></body>`}));
  await page.goto(vite.resolvedUrls.local[0]+'models-panel',{waitUntil:'domcontentloaded'});
  await page.locator('#test-model').waitFor();
}

test('Codex lists models while loading and after an API error, and keeps the selected model and effort',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/agents/codex/models',async r=>{await gate;await r.fulfill({status:502,json:{error:'CLI unavailable'}});});
  await open(page);
  const model=page.locator('#test-model');
  assert.ok(await model.locator('option').count()>10);
  await model.selectOption('gpt-6.2-astra');
  await page.locator('#test-effort').selectOption('xhigh');
  release();
  await page.waitForFunction(()=>!document.querySelector('.provider-model-hint').textContent.includes('Loading'));
  assert.ok(await model.isVisible());assert.ok(await model.locator('option').count()>10);
  assert.equal(await page.getByText(/models couldn’t be listed/).count(),0);
  assert.deepEqual(await page.evaluate(()=>fields.choice()),{provider:'codex',model:'gpt-6.2-astra',effort:'xhigh'});
});

test('a live catalogue keeps saved IDs and remains selectable after the next refresh fails',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  let requests=0;
  await page.route('**/api/agents/codex/models',r=>{
    requests++;
    return requests===1 ? r.fulfill({json:{models:[{id:'gpt-future',name:'Current model',efforts:['low','high']}]}}) : r.abort('failed');
  });
  await open(page);
  await page.getByRole('option',{name:'Current model',exact:true}).waitFor({state:'attached'});
  const model=page.locator('#test-model');
  assert.equal(await model.inputValue(),'gpt-6.1-terra');
  await model.selectOption('gpt-future');
  await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+61000;document.activeElement?.blur();});
  await model.focus();
  await page.waitForFunction(()=>!document.querySelector('.provider-model-hint').textContent.includes('Loading'));
  assert.equal(requests,2);
  assert.equal(await model.inputValue(),'gpt-future');
  assert.ok(await model.isVisible());
  assert.equal(await page.getByRole('option',{name:'Current model',exact:true}).count(),1);
});
