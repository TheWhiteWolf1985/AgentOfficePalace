import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Building } from '../src/server/building.js';
import { changeFloor, floorManagement } from '../src/server/managed-floors.js';
import { officeRepoName } from '../src/shared/floor-management.js';
import type { Ctx } from '../src/server/office/context.js';

test('floor names propose a portable private repository', () => {
  assert.equal(officeRepoName('Ufficio documenti'), 'Uff_documenti');
  assert.equal(officeRepoName('  Ufficio qualità e ricerca  '), 'Uff_qualita_e_ricerca');
  assert.equal(officeRepoName('...'), '');
});
test('moving a legacy workspace keeps its files and identity, stale deletes and external remote deletion are refused', async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'office-management-'));
  const oldStore = process.env.AGENT_OFFICE_CONNECTIONS_DIR, oldForge = process.env.AGENT_OFFICE_FLOOR_FORGEJO;
  delete process.env.AGENT_OFFICE_FLOOR_FORGEJO;
  process.env.AGENT_OFFICE_CONNECTIONS_DIR = path.join(temp, 'connections');
  try {
    const root = path.join(temp, 'projects'), data = path.join(temp, 'state'), dir = path.join(root, 'legacy');
    mkdirSync(dir, { recursive: true }); mkdirSync(data);
    writeFileSync(path.join(dir, 'notes.md'), 'local only');
    const building = new Building(data, root);
    const def = building.attach(dir, 'TEST', 'elsewhere/external', 'test');
    const floor = { id: def.id, workers: { list: () => [] }, queue: { state: () => ({ tasks: [] }) },
      meetings: { state: () => ({}) }, shutdown() {} };
    const floors = new Map([[def.id, floor]]);
    const ctx = { cfg: { dataDir: data }, building, floors, clients: new Map(), floorsChanged() {},
      openFloor() { floors.set(def.id, floor); return floor; }, closeFloor() { floors.delete(def.id); } } as unknown as Ctx;
    const initial = floorManagement(ctx).floors[0];
    const form = { floorId: def.id, version: initial.version, name: 'TEST' };
    await assert.rejects(changeFloor(ctx, 'floor-update', { ...form, workspace: '../outside' }, 'admin'), /sottocartella/);
    await assert.rejects(changeFloor(ctx, 'floor-update', { ...form, workspace: dir + '/nested' }, 'admin'), /utilizzata/);
    await assert.rejects(changeFloor(ctx, 'floor-delete', { ...form, deleteRemote: true, confirmation: def.repo }, 'admin'));
    await changeFloor(ctx, 'floor-update', { ...form, workspace: 'new' }, 'admin');
    const saved = new Building(data, root).list()[0];
    assert.equal(saved.id, def.id); assert.equal(saved.dir, path.join(root, 'new'));
    assert.equal(readFileSync(path.join(saved.dir, 'notes.md'), 'utf8'), 'local only');
    await assert.rejects(changeFloor(ctx, 'floor-delete', { ...form, deleteRemote: false }, 'admin'), /cambiato/);
    const next = { ...form, version: floorManagement(ctx).floors[0].version };
    await assert.rejects(changeFloor(ctx, 'floor-delete', next, 'admin'), /Scegliere/);
    await changeFloor(ctx, 'floor-delete', { ...next, deleteRemote: false }, 'admin');
    assert.equal(building.list().length, 0);
    assert.ok(existsSync(path.join(dir, 'notes.md')) && existsSync(path.join(saved.dir, 'notes.md')));
  } finally {
    if (oldForge === undefined) delete process.env.AGENT_OFFICE_FLOOR_FORGEJO; else process.env.AGENT_OFFICE_FLOOR_FORGEJO = oldForge;
    if (oldStore === undefined) delete process.env.AGENT_OFFICE_CONNECTIONS_DIR; else process.env.AGENT_OFFICE_CONNECTIONS_DIR = oldStore;
    rmSync(temp, { recursive: true, force: true });
  }
});
