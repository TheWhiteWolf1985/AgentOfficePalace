import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

let vite, browser, cache;
before(async () => {
  cache = await mkdtemp(path.join(os.tmpdir(), 'office-model-'));
  vite = await createServer({ configFile: false, cacheDir: cache, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await vite.listen();
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => { await browser?.close(); await vite?.close(); if (cache) await rm(cache, { recursive: true, force: true }); });

test('all office levels use the closed Blender room, live surfaces and persistent seat anchors', async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/office-model-test', r => r.fulfill({ contentType: 'text/html', body: '<body></body>' }));
    await page.goto(vite.resolvedUrls.local[0] + 'office-model-test');
    const result = await page.evaluate(async () => {
      const { OFFICE_MODELS, preloadModels } = await import('/src/client/world/models.ts');
      const { buildOffice } = await import('/src/client/world/office/build.ts');
      await preloadModels(OFFICE_MODELS);
      const office = buildOffice();
      const actual = [];
      const anchor = office.desks.get('desk-17').seatAnchor;
      for (const i of [0, 1, 2]) {
        office.setLevel(i, 3, [0, 1, 2]);
        for (const level of [0, 1, 2, 0]) {
          office.setWing(level);
          const desks = [...office.desks.values()].filter(d => d.group.visible && d.def.id.startsWith('desk-'));
          const available = office.interactables.filter(it => !it.off && it.kind === 'desk' && it.deskId.startsWith('desk-'));
          if (available.length !== desks.length || office.desks.get('desk-17').seatAnchor !== anchor) throw Error('Inconsistent desk anchors');
          actual.push(desks.length);
        }
      }
      const base = office.group.getObjectByName('Collegamenti_ufficio_unico');
      const formerlyOpen = office.interactables.filter(i => ['pole', 'ladder', 'gong', 'expand'].includes(i.kind));
      const floor = office.colliders.find(c => c.minX <= -18 && c.maxX >= 18 && c.minZ <= -13 && c.maxZ >= 13 && c.top === 0);
      const ceiling = office.colliders.find(c => c.bottom === 6.8 && c.minX === -18 && c.maxX === 18);
      const faceNames = ['issues', 'pulls', 'queue', 'services', 'tv', 'riunioni', 'targa_riunioni', 'lavagna_condivisa'];
      const faces = faceNames.map(name => {
        const face = office.group.getObjectByName('superficie_' + name);
        const { position, uv } = face.geometry.attributes;
        for (let i = 0; i < position.count; i++) {
          if (uv.getX(i) !== Number(position.getX(i) > 0) || uv.getY(i) !== Number(position.getY(i) > 0)) {
            throw Error('Canvas or video would be mirrored on ' + name);
          }
        }
        return face.isMesh;
      });
      const shelf = office.interactables.find(i => i.kind === 'bookshelf');
      const bagCount = office.colliders.length;
      const added = office.setBeanbags(new Set(['beanbag-7'])).length;
      office.setBeanbags(new Set());
      const leaf = office.group.getObjectByName('anta_saletta_dx');
      const closed = leaf.position.x;
      office.update(1, 1, [{ x: 10.7, z: 8.15, y: 0 }]);
      const opened = leaf.position.x;
      office.update(2, 1, []);
      office.elevator.setOpen(true);
      office.update(3, 1, []);
      return { actual, base: !!base, removed: formerlyOpen.length, floor: !!floor, ceiling: !!ceiling, faces, shelf: [shelf.x, shelf.z],
        lift: office.elevator.open && office.elevator.settled, meeting: opened > closed && leaf.position.x === closed,
        bags: added === 1 && bagCount === office.colliders.length };
    });
    assert.deepEqual(result.actual, [16,18,20,16,16,18,20,16,16,18,20,16]);
    assert.deepEqual(result.shelf, [-4, 11.59]);
    assert.equal(result.removed, 0);
    assert.ok(result.faces.every(Boolean));
    for (const key of ['base','floor','ceiling','lift','meeting','bags']) assert.equal(result[key], true, key);
  } finally { await page.close(); }
});
