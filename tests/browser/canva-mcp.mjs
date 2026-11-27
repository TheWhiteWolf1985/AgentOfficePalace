import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

let vite, browser, cache;
before(async () => {
  cache = await mkdtemp(path.join(os.tmpdir(), 'canva-ui-'));
  vite = await createServer({ configFile: false, cacheDir: cache, logLevel: 'error', optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, hmr: false, cors: true } });
  await vite.listen(); browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await browser?.close(); await vite?.close(); if (cache) await rm(cache, { recursive: true, force: true }); });

async function open(t, origin, configured = false, status = 'disconnected') {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage(), posts = [];
  await page.route(origin + '/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: vite.resolvedUrls.local[0] + url.pathname.slice(1) + url.search });
    await route.fulfill({ response });
  });
  const provider = { id: 'canva', name: 'Canva MCP', hasClient: configured, status, policy: { configured: false, folderId: '', folderName: '', pending: [] } };
  await page.route(origin + '/api/plugins', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON(); posts.push(data);
      if (data.action === 'canva-client') provider.hasClient = true;
      else if (data.action === 'canva-policy') provider.policy = { configured: true, folderId: data.folderId, folderName: data.folderName, pending: [] };
      else if (data.action === 'tunnel-account') return route.fulfill({ json: {
        user: 'office-tunnel', password: 'synthetic-tunnel-password', fingerprint: 'SHA256:synthetic-host-fingerprint',
      } });
      else if (data.action === 'prepare-tunnel') return route.fulfill({ json: {
        url: 'http://127.0.0.1:4600/api/plugins/callback/canva?start=fixture', command: 'ssh fixture', until: Date.now() + 600000,
      } });
      else if (data.action === 'begin') return route.fulfill({ json: { url: 'https://www.canva.com/api/oauth/authorize?client_id=fixture' } });
      else if (data.action === 'disconnect') provider.status = 'disconnected';
    }
    return route.fulfill({ json: { providers: [provider], skills: [] } });
  });
  await page.route(origin + '/plugins-panel', r => r.fulfill({ contentType: 'text/html', body: `<body><script type="module">
    import { pluginsPanel } from '/src/client/ui/plugins.ts';
    window.panel = pluginsPanel(); document.body.append(panel.element); panel.load();
  </script></body>` }));
  await page.goto(origin + '/plugins-panel'); await page.getByRole('heading', { name: 'Canva MCP', exact: true }).waitFor();
  return { page, context, posts, provider };
}

test('Canva setup requires explicit Apply, explains Redirect URLs and offers the one-time tunnel on an IP', async t => {
  const { page, posts } = await open(t, 'https://192.0.2.10');
  assert.equal(await page.locator('code').textContent(), 'http://127.0.0.1:4600/api/plugins/callback/canva');
  assert.ok(await page.getByText(/Redirect URLs, not Return URL/).isVisible());
  assert.ok(await page.getByRole('button', { name: 'Prepare sign-in tunnel' }).isDisabled());
  await page.getByLabel('Client ID', { exact: true }).fill('fixture-client');
  await page.getByLabel('Client secret', { exact: true }).fill('fixture-secret');
  assert.equal(posts.length, 0);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.deepEqual(posts, [{ action: 'canva-client', clientId: 'fixture-client', secret: 'fixture-secret' }]);
  await page.getByRole('button', { name: 'Prepare sign-in tunnel' }).click();
  await page.getByRole('link', { name: 'Sign in with Canva' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Sign in with Canva' }).getAttribute('href'), 'http://127.0.0.1:4600/api/plugins/callback/canva?start=fixture');
  assert.equal(posts[1].id, 'canva'); assert.equal(posts[1].action, 'prepare-tunnel');
  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  assert.equal(posts[2].action, 'cancel-tunnel');
});

test('dedicated SSH credentials are fetched only on request, masked and removable', async t => {
  const { page, posts } = await open(t, 'https://192.0.2.10', true);
  assert.equal(posts.length, 0);
  assert.equal(await page.getByText('synthetic-tunnel-password', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Show tunnel credentials', exact: true }).click();
  await page.getByText('office-tunnel', { exact: true }).waitFor();
  assert.deepEqual(posts, [{ action: 'tunnel-account' }]);
  const password = page.getByLabel('SSH password', { exact: true });
  assert.equal(await password.getAttribute('type'), 'password');
  assert.equal(await password.inputValue(), 'synthetic-tunnel-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await password.getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Hide credentials', exact: true }).click();
  assert.equal(await page.getByLabel('SSH password', { exact: true }).count(), 0);
});

test('Canva on a registered domain uses direct OAuth with the saved client', async t => {
  const { page, context, posts } = await open(t, 'https://office.example.org', true);
  assert.equal(await page.locator('code').textContent(), 'https://office.example.org/api/plugins/callback/canva');
  await context.route('https://www.canva.com/**', r => r.fulfill({ contentType: 'text/html', body: 'Canva consent fixture' }));
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Sign in with Canva', exact: true }).click();
  const consent = await popup; await consent.waitForURL('https://www.canva.com/**');
  assert.deepEqual(posts, [{ action: 'begin', id: 'canva' }]);
  assert.equal(await page.getByRole('button', { name: 'Prepare sign-in tunnel' }).count(), 0);
});

test('Canva disconnect retains the saved application configuration', async t => {
  const { page, posts } = await open(t, 'https://office.example.org', true, 'connected');
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Disconnect account', exact: true }).click();
  await page.getByText('Disconnected', { exact: true }).waitFor();
  assert.deepEqual(posts, [{ action: 'disconnect', id: 'canva' }]);
  assert.ok(await page.getByRole('button', { name: 'Sign in with Canva' }).isEnabled());
});

test('the Canva folder is applied explicitly and new resources are explained in the UI', async t => {
  const { page, posts, provider } = await open(t, 'https://office.example.org', true, 'connected');
  await page.getByLabel('Canva folder ID', { exact: true }).fill('Ffixture');
  assert.equal(posts.length, 0);
  assert.ok(await page.getByText('Choose and verify a folder to enable Canva writes.', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Apply', exact: true }).last().click();
  await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.deepEqual(posts, [{ action: 'canva-policy', folderId: 'Ffixture', folderName: 'AI_MARKETING' }]);
  assert.equal(provider.policy.configured, true);
  await page.getByText('Canva write folder', { exact: true }).click();
  assert.ok(await page.getByText('Canva folder protection is active for all agents.', { exact: true }).isVisible());
});
