import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Building } from '../src/server/building.js';
import { git, testOffice } from './support/managed-floor-office.js';

const repo = 'uffici/Uff_test';

test('concurrent creates provision one private main, one checkout and one persistent binding', async t => {
  const f = await testOffice(t); f.seedGit();
  const results = await Promise.allSettled([f.create(), f.create({ workspace: 'another' })]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  const floor = f.view();
  assert.deepEqual(f.calls.filter(c => c.method === 'POST').map(c => c.body), [
    { name: 'Uff_test', private: true, auto_init: true, default_branch: 'main' }
  ]);
  assert.equal(new Building(f.data, f.root).list()[0].forgejoId, f.repos.get(repo)?.id);
  assert.equal(f.store.binding(floor.dir)?.accountId, f.reader.id);
  assert.equal(git(floor.dir, 'branch', '--show-current'), 'main');
  assert.equal(git(floor.dir, 'remote', 'get-url', 'origin'), f.url + '/' + repo + '.git');
  assert.deepEqual(readdirSync(f.root), ['office']);
});

test('existing private repositories require opt-in, keep their ownership, and can be detached', async t => {
  const f = await testOffice(t); f.seedGit(); f.addRepo(repo);
  await assert.rejects(f.create(), /già esistente/);
  await f.create({ existing: true });
  assert.equal(f.view().canDeleteRepo, false);
  await assert.rejects(f.remove({ deleteRemote: true, confirmation: repo }), /creato da Office/);
  await f.remove({ deleteRemote: false });
  assert.ok(f.repos.has(repo));
  assert.equal(f.store.snapshot().bindings.length, 0);
  assert.ok(existsSync(path.join(f.root, 'office', 'README.md')));
  assert.deepEqual(f.calls.filter(c => c.method !== 'GET'), []);
});

test('missing, public and foreign repositories cannot be linked', async t => {
  const f = await testOffice(t);
  await assert.rejects(f.create({ existing: true }), /non trovato/);
  f.addRepo(repo, false);
  await assert.rejects(f.create({ existing: true }), /privato valido/);
  await assert.rejects(f.create({ existing: true, repository: 'other/Uff_test' }), /organizzazione/);
  assert.deepEqual(f.building.list(), []);
  assert.deepEqual(readdirSync(f.root), []);
  assert.deepEqual(f.calls.filter(c => c.method !== 'GET'), []);
});

test('a failed clone keeps the private repository, and a retry links the same identity', async t => {
  const f = await testOffice(t); f.seedGit(); f.faults.gitUnavailable = true;
  await assert.rejects(f.create(), /Collega esistente/);
  const created = f.repos.get(repo)!;
  assert.deepEqual(readdirSync(f.root), []);
  assert.deepEqual(f.store.snapshot().bindings, []);
  f.faults.gitUnavailable = false;
  await f.create({ existing: true });
  assert.equal(f.building.list()[0].forgejoId, created.id);
  assert.equal(f.view().canDeleteRepo, true);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('a checkout containing reserved office state is rejected before registration', async t => {
  const f = await testOffice(t); f.seedGit(true); f.addRepo(repo);
  await assert.rejects(f.create({ existing: true }), /riservata/);
  assert.deepEqual(readdirSync(f.root), []);
  assert.deepEqual(f.building.list(), []);
  assert.deepEqual(f.store.snapshot().bindings, []);
});

test('retaining, relinking and deleting a managed repository uses its original Forgejo ID', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const first = f.view(), originalId = f.repos.get(repo)!.id;
  await f.remove({ deleteRemote: false });
  assert.equal(f.repos.get(repo)?.id, originalId);
  await f.create({ existing: true, workspace: 'rebuilt' });
  assert.ok(f.view().canDeleteRepo);
  await assert.rejects(f.remove({ deleteRemote: true, confirmation: 'Uff_test' }), /nome completo/);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
  const second = f.view();
  await f.remove({ deleteRemote: true, confirmation: repo });
  assert.equal(f.repos.size, 0);
  assert.deepEqual(f.building.list(), []);
  assert.deepEqual(f.store.snapshot().bindings, []);
  for (const floor of [first, second]) assert.ok(existsSync(path.join(floor.dir, 'README.md')));
});

for (const change of ['new ID', 'public visibility'] as const) {
  test('remote deletion refuses a change in ' + change, async t => {
    const f = await testOffice(t); f.seedGit(); await f.create();
    if (change === 'new ID') f.addRepo(repo); else f.repos.get(repo)!.private = false;
    await assert.rejects(f.remove({ deleteRemote: true, confirmation: repo }), /Identità/);
    assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
    assert.ok(f.store.binding(f.view().dir));
  });
}

test('Forgejo deletion failure leaves the office usable and the same command can be retried', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const floor = f.view(); f.faults.deleteStatus = 503;
  const input = { deleteRemote: true, confirmation: repo, version: floor.version };
  await assert.rejects(f.remove(input), /503/);
  assert.deepEqual(f.view(), floor);
  assert.ok(f.ctx.floors.has(floor.id) && f.store.binding(floor.dir) && f.repos.has(repo));
  f.faults.deleteStatus = 0;
  await f.remove(input);
  assert.equal(f.repos.size, 0);
  assert.equal(f.ctx.floors.size, 0);
});

test('a legacy second floor referencing the same remote prevents remote deletion', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const other = path.join(f.root, 'legacy'); mkdirSync(other);
  f.building.attach(other, 'Legacy', repo, 'admin');
  await assert.rejects(f.remove({ deleteRemote: true, confirmation: repo }), /altro piano/);
  assert.equal(f.building.list().length, 2);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
  assert.ok(f.repos.has(repo));
});

test('retrying removal after the remote has already disappeared keeps the local checkout', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const dir = f.view().dir;
  f.repos.delete(repo);
  await f.remove({ deleteRemote: true, confirmation: repo });
  assert.deepEqual(f.building.list(), []);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
  assert.ok(existsSync(path.join(dir, 'README.md')));
});

test('moving a workspace preserves documents, agent assignments, history and returning visitors', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const old = f.view(), binding = f.store.binding(old.dir)!;
  f.store.bind({ ...binding, agents: { pixel: { accountId: f.reader.id } } });
  const visitor = { peer: { floor: old.id } }; f.clients.set('visitor', visitor);
  const head = git(old.dir, 'rev-parse', 'HEAD');
  writeFileSync(path.join(old.dir, 'notes.md'), 'work in progress');
  await f.update({ workspace: 'moved' });
  const next = f.view();
  assert.equal(next.id, old.id); assert.equal(visitor.peer.floor, old.id);
  assert.equal(git(next.dir, 'rev-parse', 'HEAD'), head);
  for (const dir of [old.dir, next.dir]) assert.equal(readFileSync(path.join(dir, 'notes.md'), 'utf8'), 'work in progress');
  assert.equal(f.store.binding(old.dir), undefined);
  assert.equal(f.store.binding(next.dir)?.agents.pixel.accountId, f.reader.id);
  await assert.rejects(f.remove({ version: old.version, deleteRemote: true, confirmation: repo }), /cambiato/);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
});

test('changing repository keeps local commits and uncommitted work, and preserves the former remote', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create();
  const old = f.view(), head = git(old.dir, 'rev-parse', 'HEAD');
  f.addRepo('uffici/other');
  writeFileSync(path.join(old.dir, 'README.md'), 'edited locally');
  await f.update({ repository: 'uffici/other', existing: true });
  assert.equal(git(old.dir, 'remote', 'get-url', 'origin'), f.url + '/uffici/other.git');
  assert.equal(git(old.dir, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(path.join(old.dir, 'README.md'), 'utf8'), 'edited locally');
  assert.ok(f.repos.has(repo));
  assert.equal(f.store.binding(old.dir)?.repository, 'uffici/other');
  assert.equal(f.view().canDeleteRepo, false);
});

test('a legacy folder with conflicting local documents stays intact when linking a checkout', async t => {
  const f = await testOffice(t); f.seedGit(); f.addRepo(repo);
  const floor = f.legacy();
  writeFileSync(path.join(floor.dir, 'README.md'), 'my local document');
  await assert.rejects(f.update({ repository: repo, existing: true }), /conflitto/);
  assert.deepEqual(readdirSync(floor.dir), ['README.md']);
  assert.equal(readFileSync(path.join(floor.dir, 'README.md'), 'utf8'), 'my local document');
  assert.equal(f.view().repo, '');
  assert.deepEqual(f.store.snapshot().bindings, []);
});

test('busy agents, an open meeting or unfinished tasks stop repository creation before any remote write', async t => {
  const f = await testOffice(t); f.legacy();
  const change = { repository: repo, existing: false };
  f.workers.push({ status: 'working' });
  await assert.rejects(f.update(change), /incarichi/); f.workers.pop();
  f.meeting.status = 'running';
  await assert.rejects(f.update(change), /riunioni/); f.meeting.status = 'done';
  f.tasks.push({ status: 'queued' });
  await assert.rejects(f.update(change), /incarichi/);
  assert.deepEqual(f.calls, []);
});

test('moving refuses unpaused sessions, linked worktrees and occupied destinations', async t => {
  const f = await testOffice(t); const floor = f.legacy(), change = { workspace: 'moved' };
  f.workers.push({ status: 'idle' });
  await assert.rejects(f.update(change), /Fermare le sessioni/);
  f.workers[0].paused = true;
  mkdirSync(path.join(floor.dir, '.git', 'worktrees'), { recursive: true });
  await assert.rejects(f.update(change), /worktree/);
  mkdirSync(path.join(f.root, 'moved'));
  await assert.rejects(f.update(change), /nuova cartella/);
  assert.equal(f.view().dir, floor.dir);
});

test('an unsuccessful reopen restores the original remote, binding, floor and visitors', async t => {
  const f = await testOffice(t); f.seedGit(); await f.create(); f.addRepo('uffici/other');
  const floor = f.view(), binding = f.store.binding(floor.dir);
  const visitor = { peer: { floor: floor.id } }; f.clients.set('visitor', visitor);
  f.faults.failNextOpen = true;
  await assert.rejects(f.update({ repository: 'uffici/other', existing: true }), /non si apre/);
  assert.deepEqual(f.view(), floor);
  assert.deepEqual(f.store.binding(floor.dir), binding);
  assert.equal(git(floor.dir, 'remote', 'get-url', 'origin'), f.url + '/' + repo + '.git');
  assert.ok(f.ctx.floors.has(floor.id));
  assert.equal(visitor.peer.floor, floor.id);
});

test('failed first open keeps the clone recoverable and the requested workspace reusable', async t => {
  const f = await testOffice(t); f.seedGit(); f.faults.failNextOpen = true;
  await assert.rejects(f.create(), /Collega esistente/);
  assert.deepEqual(f.building.list(), []);
  assert.deepEqual(f.store.snapshot().bindings, []);
  assert.equal(existsSync(path.join(f.root, 'office')), false);
  const [retained] = readdirSync(f.root);
  assert.ok(existsSync(path.join(f.root, retained, 'README.md')));
  await f.create({ existing: true });
  assert.equal(f.view().dir, path.join(f.root, 'office'));
});

test('failed move keeps the original active and allows retry with the same destination', async t => {
  const f = await testOffice(t); const original = f.legacy();
  writeFileSync(path.join(original.dir, 'notes.md'), 'uncommitted work');
  f.faults.failNextOpen = true;
  await assert.rejects(f.update({ workspace: 'moved' }), /non si apre/);
  assert.equal(f.view().dir, original.dir);
  assert.equal(existsSync(path.join(f.root, 'moved')), false);
  await f.update({ workspace: 'moved' });
  assert.equal(readFileSync(path.join(f.view().dir, 'notes.md'), 'utf8'), 'uncommitted work');
});

test('two editors submitting the same version cannot overwrite one another', async t => {
  const f = await testOffice(t); f.legacy();
  const first = f.update({ name: 'First' }), second = f.update({ name: 'Second' });
  await first;
  await assert.rejects(second, /cambiato/);
  assert.equal(f.view().name, 'First');
  assert.equal(new Building(f.data, f.root).list()[0].name, 'First');
});
