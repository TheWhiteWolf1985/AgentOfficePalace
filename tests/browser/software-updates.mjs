import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

let vite, browser, cache;
before(async () => {
  cache = await mkdtemp(path.join(os.tmpdir(), 'office-update-ui-'));
  vite = await createServer({ configFile: false, cacheDir: cache, logLevel: 'error',
    optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await browser?.close(); await vite?.close(); if (cache) await rm(cache, { recursive: true, force: true }); });

for (const mode of ['Lite', '3D']) for (const width of [390, 1100]) test(mode + ' update notice opens settings at ' + width + 'px', async () => {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  try {
    const tag = 'v1.0.2';
    const posts = [];
    await page.route('**/api/software-updates', r => {
      const command = r.request().postDataJSON();
      if (command) posts.push(command);
      return r.fulfill({ json: { managed: true, busy: 2, channel: 'stable', current: 'v1.0.1',
        available: { tag, notes: 'New office' }, job: command?.action === 'apply' ? { tag, phase: 'waiting' } : {} } });
    });
    await page.route('**/update-ui-test', r => r.fulfill({ contentType: 'text/html',
      body: mode === '3D'
        ? '<html><body><div id="app"><canvas id="scene"></canvas><div id="hud"><header class="topbar"><div>Office</div><div id="update-notice"></div><nav class="dock"><button>Menu</button></nav></header></div><main id="modal-root"></main></div></body></html>'
        : '<html><body class="lite"><header class="lite-bar">Office</header><main class="lite-main"></main><nav class="lite-nav"><button class="btn">Tasks</button></nav></body></html>' }));
    await page.goto(vite.resolvedUrls.local[0] + 'update-ui-test');
    await page.evaluate(async (mode) => {
      localStorage.setItem('agent-office.language','it');
      if (mode === 'Lite') await import('/src/client/lite.css');
      else await import('/src/client/style.css');
      const { openModal } = await import('/src/client/ui/dom.ts');
      const { store } = await import('/src/client/state/index.ts');
      const { watchUpdates, updatesPanel } = await import('/src/client/ui/software-updates.ts');
      store.me = { admin: true };
      watchUpdates(document.querySelector(mode === 'Lite' ? '.lite-main' : '#update-notice'), () => {
        const panel = updatesPanel();
        if (mode === '3D') openModal(panel.element);
        else document.querySelector('main').append(panel.element);
        panel.load();
      });
    }, mode);
    await page.locator('.office-update-badge').click({ timeout: 10000 });
    assert.deepEqual(posts, []);
    await page.getByRole('button', { name: /Aggiorna al termine|Update when tasks finish/ }).click();
    await page.locator('[role="status"]').filter({ hasText: /In attesa|Waiting for busy/ }).waitFor();
    assert.deepEqual(posts, [{ action: 'apply', tag }]);
  } finally { await page.close(); }
});
