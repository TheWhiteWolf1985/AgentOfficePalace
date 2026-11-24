// Run with node --test tests/browser/managed-floors.mjs on a machine with Chrome.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

let vite, browser, cache;
before(async () => {
  cache = await mkdtemp(path.join(os.tmpdir(), 'office-floor-ui-'));
  vite = await createServer({ configFile: false, cacheDir: cache, logLevel: 'error',
    optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => {
  await browser?.close(); await vite?.close();
  if (cache) await rm(cache, { recursive: true, force: true });
});

async function open(t, existing = true, managed = true) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const state = { configured: true, organization: 'uffici', root: '/projects', floors: existing
    ? [{ id: 'test', name: 'TEST', repo: 'uffici/Uff_test', dir: '/projects/test', version: '1', canDeleteRepo: managed }] : [] };
  const api = { posts: [], error: '', delayRead: undefined };
  await page.route('**/api/connections*', async route => {
    if (route.request().method() === 'GET') {
      if (api.delayRead) await api.delayRead();
      await route.fulfill({ json: state });
    } else {
      const data = route.request().postDataJSON(); api.posts.push(data);
      await route.fulfill(api.error ? { status: 400, json: { error: api.error } } : { json: { floorId: 'test' } });
    }
  });
  await page.route('**/floor-panel', route => route.fulfill({ contentType: 'text/html',
    body: `<script type="module">
      import { floorManagementPanel } from '/src/client/ui/floor-management.ts';
      window.panel = floorManagementPanel('test'); document.body.append(panel.element); panel.load();
    </script><body></body>` }));
  await page.goto(vite.resolvedUrls.local[0] + 'floor-panel');
  const name = page.getByLabel('Floor name'), apply = page.getByRole('button', { name: 'Apply', exact: true });
  await name.waitFor();
  return { page, name, apply, api };
}

test('editing is explicit, cancellation keeps the draft and a failed Apply can be retried', async t => {
  const { page, name, apply, api } = await open(t);
  assert.ok(await apply.isDisabled());
  await name.fill('Documenti');
  assert.deepEqual(api.posts, []);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Office floor').selectOption('');
  assert.equal(await name.inputValue(), 'Documenti');
  api.error = 'Forgejo offline';
  await apply.click();
  await page.getByText('Forgejo offline', { exact: true }).waitFor();
  assert.equal(await name.inputValue(), 'Documenti');
  api.error = '';
  await apply.click(); await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.equal(api.posts.length, 2);
  assert.deepEqual(api.posts[0], api.posts[1]);
  assert.equal(api.posts[0].version, '1');
  assert.equal(api.posts[0].action, 'floor-update');
});

test('a new floor defaults to private creation and sends only when Apply is pressed', async t => {
  const { page, name, apply, api } = await open(t, false);
  await name.fill('Ufficio documenti');
  assert.equal(await page.getByLabel('Remote repository').getAttribute('placeholder'), 'Uff_documenti');
  assert.equal(await page.getByLabel('Repository action').inputValue(), 'new');
  assert.deepEqual(api.posts, []);
  await apply.click(); await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.deepEqual(api.posts, [{ action: 'floor-create', name: 'Ufficio documenti', repository: '', existing: false, workspace: '' }]);
});

test('deletion defaults to keep, needs an exact full name to delete, and respects cancel', async t => {
  const { page, api } = await open(t);
  await page.locator('summary').click();
  const mode = page.getByLabel('When removing this floor'), remove = page.getByRole('button', { name: 'Remove floor', exact: true });
  assert.equal(await mode.inputValue(), 'keep');
  page.once('dialog', dialog => dialog.dismiss()); await remove.click();
  assert.deepEqual(api.posts, []);
  await mode.selectOption('delete');
  const confirm = page.getByLabel('Type the full repository name to delete it');
  await confirm.fill('Uff_test'); assert.ok(await remove.isDisabled());
  await confirm.fill('uffici/Uff_test'); assert.ok(await remove.isEnabled());
  page.once('dialog', dialog => dialog.accept()); await remove.click();
  await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.deepEqual(api.posts, [{ action: 'floor-delete', floorId: 'test', version: '1', deleteRemote: true, confirmation: 'uffici/Uff_test' }]);
});

test('an imported remote only offers keep and sends an explicit keep request', async t => {
  const { page, api } = await open(t, true, false);
  await page.locator('summary').click();
  const choices = page.getByLabel('When removing this floor').locator('option');
  assert.deepEqual(await choices.evaluateAll(options => options.map(o => o.value)), ['keep']);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Remove floor', exact: true }).click();
  await page.getByText('Settings applied', { exact: true }).waitFor();
  assert.equal(api.posts[0].deleteRemote, false);
});

test('a late refresh cannot discard text being edited', async t => {
  const { page, name, apply, api } = await open(t);
  let release, started;
  const pending = new Promise(resolve => { started = resolve; });
  api.delayRead = () => { started(); return new Promise(resolve => { release = resolve; }); };
  await page.evaluate(() => window.panel.load());
  await pending;
  await name.fill('Bozza in corso');
  const finished = page.waitForResponse(r => r.url().includes('floor-management=1'));
  release(); await (await finished).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await name.inputValue(), 'Bozza in corso');
  assert.ok(await apply.isEnabled());
});
