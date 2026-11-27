import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CanvaPolicy, validateCanvaArgs } from '../bin/plugin-skills/canva-policy.mjs';

const actor = { worker: 'iris', floor: 'marketing' };
const second = { worker: 'other', floor: 'marketing' };
const answer = (value: object) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const names = ['search-designs', 'get-design', 'get-design-pages', 'get-design-content', 'list-folder-items', 'search-folders',
  'list-brand-kits', 'search-brand-templates', 'list-comments', 'list-replies', 'create-design', 'copy-design',
  'create-design-from-brand-template', 'import-design-from-url', 'autofill-design', 'resize-design',
  'get-create-design-async-job', 'start-editing-transaction', 'perform-editing-operations', 'edit-design',
  'commit-editing-transaction', 'cancel-editing-transaction', 'get-design-thumbnail', 'comment-on-design', 'reply-to-comment',
  'move-item-to-folder', 'upload-asset-from-url', 'generate-image', 'export-design', 'delete-design', 'new-provider-write',
  'create-folder', 'publish-brand-template', 'share-design'];

async function setup(t: any, configured = true) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'canva-policy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const account = { connectionId: 'connection-1' };
  const members = new Set(['Dinside']);
  const calls: { name: string; args: any }[] = [];
  let clock = 100_000;
  const schemas = names.map(name => ({ name: 'canva.' + name,
    inputSchema: { type: 'object', properties: {}, additionalProperties: true } }));
  const options = { directory, account: () => account, catalogue: async () => schemas, now: () => clock,
    invoke: async (name: string, args: any) => {
      calls.push({ name: name.slice(6), args: structuredClone(args) });
      if (name.endsWith('search-folders')) return answer({ folders: [{ id: 'Fallowed', name: 'AI_MARKETING' }, { id: 'Fduplicate', name: 'AI_MARKETING' }] });
      if (name.endsWith('list-folder-items')) return answer({ items: [...members].map(id => ({ type: 'design', design: { id } })) });
      if (name.endsWith('move-item-to-folder')) { assert.equal(args.to_folder_id, 'Fallowed'); members.add(args.item_id); return answer({}); }
      if (name.endsWith('start-editing-transaction')) return answer({ transaction_id: 'TX1' });
      if (name.endsWith('list-comments')) return answer({ comments: [{ id: 'Cinside' }] });
      if (['create-design', 'copy-design', 'create-design-from-brand-template', 'import-design-from-url', 'autofill-design', 'resize-design'].some(n => name === 'canva.' + n))
        return answer({ design: { id: 'Dnew', url: 'https://www.canva.com/design/Dnew/view' } });
      return answer({ ok: true });
    } };
  let policy = new CanvaPolicy(options);
  if (configured) await policy.setPolicy('Fallowed', 'AI_MARKETING');
  calls.length = 0;
  return { directory, account, members, calls, schemas, options, get policy() { return policy; },
    reload() { policy = new CanvaPolicy(options); }, time(n: number) { clock += n; },
    call: (name: string, args = {}, who = actor) => policy.call('canva.' + name, args, who),
    writes: () => calls.filter(c => !['list-folder-items', 'search-folders', 'get-design', 'list-comments', 'list-replies',
      'get-create-design-async-job', 'list-brand-kits', 'search-brand-templates', 'export-design'].includes(c.name)) };
}
const start = (f: any) => f.call('start-editing-transaction', { design_id: 'Dinside' });
const commit = (f: any, who = actor) => f.call('commit-editing-transaction', { transaction_id: 'TX1' }, who);

test('T01 reads outside the folder without a configured policy or writes', async t => {
  const f = await setup(t, false); await f.call('get-design', { design_id: 'Doutside' }); assert.equal(f.writes().length, 0);
});
test('T02 starts and commits an editing transaction on a current direct member', async t => {
  const f = await setup(t); await start(f); await commit(f); assert.deepEqual(f.writes().map(c => c.name), ['start-editing-transaction', 'commit-editing-transaction']);
});
test('T03 blocks writes outside before provider mutation', async t => {
  const f = await setup(t); await assert.rejects(f.call('start-editing-transaction', { design_id: 'Doutside' }), /outside_allowed_folder/); assert.equal(f.writes().length, 0);
});
test('T04 folder name does not authorize a different ID', async t => {
  const f = await setup(t); const p = f.policy.view(); await assert.rejects(f.policy.setPolicy('Funknown', 'AI_MARKETING'), /invalid_folder/); assert.equal(f.policy.view().folderId, p.folderId);
});
test('T05 membership inside a child folder is not direct membership', async t => {
  const f = await setup(t); f.options.invoke = async (name, args) => { f.calls.push({ name: name.slice(6), args }); return answer({ items: [{ type: 'folder', folder: { id: 'Fchild' } }] }); };
  f.reload(); await assert.rejects(start(f), /outside_allowed_folder/); assert.equal(f.writes().length, 0);
});
test('T06 all folder pages are followed, including a later member', async t => {
  const f = await setup(t); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => name.endsWith('list-folder-items') ? answer(args.continuation ? { items: [{ type: 'design', design: { id: 'Dinside' } }] } : { items: [], continuation: 'next' }) : invoke(name, args);
  f.reload(); await start(f); assert.equal(f.writes().length, 1);
});
test('T07 provider verification failures cannot authorize writes', async t => {
  const f = await setup(t); f.options.invoke = async () => { throw Error('timeout'); }; f.reload(); await assert.rejects(start(f), /timeout/); assert.equal(f.writes().length, 0);
});
test('T08 caller and policy overrides are rejected, including nested targets', async t => {
  const f = await setup(t); await assert.rejects(f.call('start-editing-transaction', { design_id: 'Dinside', folder_id: 'Fallowed', caller: second }), /not_allowed/);
  await assert.rejects(f.policy.call('canva.get-design', { design_id: 'Dinside' }, {}), /caller_not_authorized/); assert.equal(f.writes().length, 0);
});
test('T09 unknown tools remain denied even if advertised read-only', async t => {
  const f = await setup(t); (f.schemas.at(-1) as any).annotations = { readOnlyHint: true };
  await assert.rejects(f.call('new-provider-write'), /not_allowed/); assert.equal(f.writes().length, 0);
});
test('T10 hidden direct calls cannot bypass policy', async t => {
  const f = await setup(t); assert.equal((await f.policy.tools()).some(t => t.name === 'canva.move-item-to-folder'), false);
  await assert.rejects(f.call('move-item-to-folder', { item_id: 'Doutside', to_folder_id: 'Fallowed' }), /not_allowed/); assert.equal(f.writes().length, 0);
});
test('T11 each edit and commit repeats membership verification', async t => {
  const f = await setup(t); await start(f); await f.call('perform-editing-operations', { transaction_id: 'TX1', operations: [] }); await commit(f);
  assert.equal(f.calls.filter(c => c.name === 'list-folder-items').length, 3);
});
test('T12 transactions cannot be borrowed by another worker, floor or reused after commit', async t => {
  const f = await setup(t); await start(f); await assert.rejects(commit(f, second), /transaction_not_authorized/);
  await assert.rejects(commit(f, { ...actor, floor: 'another' }), /transaction_not_authorized/); await commit(f); await assert.rejects(commit(f), /transaction_not_authorized/);
});
test('T13 moving the design outside revokes pending edits and commits', async t => {
  const f = await setup(t); await start(f); f.members.clear(); await assert.rejects(commit(f), /outside_allowed_folder/); assert.equal(f.writes().length, 1);
});
test('T14 persisted associations survive restart, not a new account', async t => {
  const f = await setup(t); await start(f); f.reload(); await f.call('get-design-thumbnail', { transaction_id: 'TX1' });
  f.account.connectionId = 'different'; await assert.rejects(commit(f), /policy_not_configured/);
});
test('T15 creating in default location automatically moves and verifies before success', async t => {
  const f = await setup(t); const result = await f.call('create-design', { brief: 'fixture' });
  assert.equal(result.office_creation.status, 'completed'); assert.ok(f.members.has('Dnew')); assert.deepEqual(f.writes().map(c => c.name), ['create-design', 'move-item-to-folder']);
});
test('T16 worker cannot finalize an arbitrary resource or choose a destination', async t => {
  const f = await setup(t); await assert.rejects(f.call('create-design', { brief: 'fixture', to_folder_id: 'Foutside' }), /not_allowed/);
  await assert.rejects(f.policy.reconcile('Doutside'), /transaction_not_authorized/); assert.equal(f.writes().length, 0);
});
for (const name of ['copy-design', 'create-design-from-brand-template', 'import-design-from-url', 'autofill-design', 'resize-design'])
  test('T17 ' + name + ' finalizes only the new output, leaving the source unchanged', async t => {
    const f = await setup(t); const args = name === 'import-design-from-url' ? { url: 'https://example.org/test.pdf', name: 'test' } :
      name === 'create-design-from-brand-template' ? { brand_template_id: 'BToutside' } : { design_id: 'Doutside' };
    await f.call(name, args); assert.ok(f.members.has('Dnew')); assert.equal(f.members.has('Doutside'), false);
    assert.equal(f.writes().filter(c => c.name === 'move-item-to-folder')[0].args.item_id, 'Dnew');
  });
test('T18 unreviewed asset destinations are denied before upload or generation', async t => {
  const f = await setup(t); for (const n of ['upload-asset-from-url', 'generate-image']) await assert.rejects(f.call(n, { url: 'https://example.org/x.png' }), /not_allowed/); assert.equal(f.writes().length, 0);
});
test('T19 moves of existing items, sharing, publishing, folders and deletion are denied', async t => {
  const f = await setup(t); for (const n of ['move-item-to-folder', 'share-design', 'publish-brand-template', 'create-folder', 'delete-design']) await assert.rejects(f.call(n), /not_allowed/); assert.equal(f.writes().length, 0);
});
test('T20 comments require direct membership and replies require a matching existing thread', async t => {
  const f = await setup(t); await assert.rejects(f.call('comment-on-design', { design_id: 'Doutside', text: 'fixture' }), /outside_allowed_folder/);
  await assert.rejects(f.call('reply-to-comment', { design_id: 'Dinside', comment_id: 'Coutside', text: 'fixture' }), /transaction_not_authorized/);
  assert.equal(f.writes().length, 0); await f.call('reply-to-comment', { design_id: 'Dinside', comment_id: 'Cinside', text: 'fixture' }); assert.equal(f.writes().length, 1);
});
test('T21 brand kits and templates stay available without changing originals', async t => {
  const f = await setup(t); await f.call('list-brand-kits'); await f.call('search-brand-templates'); assert.equal(f.writes().length, 0);
});
test('T22 export reads an external original and creates no Canva resource', async t => {
  const f = await setup(t); await f.call('export-design', { design_id: 'Doutside', format: { type: 'pdf' } }); assert.equal(f.writes().length, 0);
});
test('T23 uncertain writes are not replayed and their transaction cannot be recommitted', async t => {
  const f = await setup(t); await start(f); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => { if (name.endsWith('commit-editing-transaction')) { f.calls.push({ name: name.slice(6), args }); throw Error('response lost'); } return invoke(name, args); };
  f.reload(); await assert.rejects(commit(f), /response lost/); await assert.rejects(commit(f), /transaction_not_authorized/); assert.equal(f.writes().filter(c => c.name === 'commit-editing-transaction').length, 1);
});
test('T24 missing or corrupt policy blocks all writes while preserving read access', async t => {
  const f = await setup(t, false); await assert.rejects(start(f), /policy_not_configured/);
  writeFileSync(path.join(f.directory, 'canva-policy.json'), '{broken'); f.reload(); await assert.rejects(start(f), /policy_not_configured/); await f.call('get-design', { design_id: 'Doutside' }); assert.equal(f.writes().length, 0);
});
test('T25 nested target substitutions are rejected before the mutation', async t => {
  const f = await setup(t); await start(f); await assert.rejects(f.call('perform-editing-operations', { transaction_id: 'TX1', operations: [{ target_design_id: 'Doutside' }] }), /outside_allowed_folder/); assert.equal(f.writes().length, 1);
});
test('T26 audit records actor, decision and folder but no prompts, signed URLs or tokens', async t => {
  const f = await setup(t); await f.call('create-design', { brief: 'PRIVATE SECRET TOKEN https://example.org/?signature=secret' });
  const logs = readFileSync(path.join(f.directory, 'canva-audit.jsonl'), 'utf8'); assert.match(logs, /iris/); assert.match(logs, /Fallowed/); assert.doesNotMatch(logs, /PRIVATE|SECRET|signature/);
});
test('T27 concurrent commits serialize and only one mutation is dispatched', async t => {
  const f = await setup(t); await start(f); const results = await Promise.allSettled([commit(f), commit(f)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.writes().filter(c => c.name === 'commit-editing-transaction').length, 1);
});
test('T28 failed move remains pending without recreation, external edits or deletion', async t => {
  const f = await setup(t); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => name.endsWith('move-item-to-folder') ? answer({ denied: true, items: [] }) : invoke(name, args); f.reload();
  await assert.rejects(f.call('create-design', { brief: 'fixture' }), /pending_finalization/); assert.equal(f.policy.view().pending[0].stage, 'pending_finalization');
  await assert.rejects(f.call('create-design', { brief: 'fixture' }), /pending_finalization/); assert.equal(f.writes().filter(c => c.name === 'create-design').length, 1);
});
test('T29 a lost move response is reconciled by membership without replay', async t => {
  const f = await setup(t); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => { const result = await invoke(name, args); if (name.endsWith('move-item-to-folder')) throw Error('response lost'); return result; }; f.reload();
  await assert.rejects(f.call('create-design', { brief: 'fixture' }), /pending_finalization/); const operation = f.policy.view().pending[0].id;
  await f.policy.reconcile(operation); assert.equal(f.policy.view().pending.length, 0); assert.equal(f.writes().filter(c => c.name === 'move-item-to-folder').length, 1);
});
test('T30 async creation resumes after restart and finalizes automatically after provider wait', async t => {
  const f = await setup(t); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => name === 'canva.create-design' ? answer({ job_id: 'JOB1', continuation_token: 'opaque', polling_policy: { wait_seconds: 2 }, status: 'pending' }) :
    name === 'canva.get-create-design-async-job' ? answer({ job_id: 'JOB1', status: 'completed', design: { id: 'Dnew' } }) : invoke(name, args);
  f.reload(); const result = await f.call('create-design', { brief: 'async' }); assert.equal(result.office_creation.status, 'creating');
  f.reload(); await f.policy.tick(); assert.equal(f.members.has('Dnew'), false); f.time(2001); await f.policy.tick(); assert.ok(f.members.has('Dnew')); assert.equal(f.policy.view().pending.length, 0);
});
test('T31 all outputs are finalized and missing provider identifiers cannot be supplied by a worker', async t => {
  const f = await setup(t); const invoke = f.options.invoke;
  f.options.invoke = async (name, args) => name === 'canva.create-design' ? answer({ designs: [{ id: 'Dnew1' }, { id: 'Dnew2' }] }) : invoke(name, args); f.reload();
  await f.call('create-design', { brief: 'multi' }); assert.ok(f.members.has('Dnew1')); assert.ok(f.members.has('Dnew2'));
  f.options.invoke = async (name, args) => name === 'canva.create-design' ? answer({ status: 'completed' }) : invoke(name, args); f.reload();
  await assert.rejects(f.call('create-design', { brief: 'missing' }), /outcome_unknown/); await assert.rejects(f.call('move-item-to-folder', { item_id: 'Dfake', to_folder_id: 'Fallowed' }), /not_allowed/);
});
test('reviewed schemas reject drift, missing required arguments and external schema references', () => {
  assert.equal(validateCanvaArgs({ type: 'object', required: ['design_id'], additionalProperties: false, properties: { design_id: { type: 'string' } } }, {}), false);
  assert.equal(validateCanvaArgs({ $ref: 'https://example.org/schema' }, {}), false);
  assert.equal(validateCanvaArgs({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 1), true);
});
test('a missing move capability prevents creation before any mutation', async t => {
  const f = await setup(t); f.schemas.splice(f.schemas.findIndex(s => s.name === 'canva.move-item-to-folder'), 1);
  await assert.rejects(f.call('create-design', { brief: 'fixture' }), /finalization_unsupported/); assert.equal(f.writes().length, 0);
});
test('unknown arguments on an existing read tool are denied despite permissive provider schema', async t => {
  const f = await setup(t); await assert.rejects(f.call('get-design', { design_id: 'Dinside', delete: true }), /not_allowed/); assert.equal(f.calls.length, 0);
});
