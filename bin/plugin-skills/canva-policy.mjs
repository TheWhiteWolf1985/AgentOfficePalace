// This policy runs in Plugin & Skills. Provider tokens and policy state never reach workers.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { Problem } from './provider-http.mjs';

const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (code, detail = '') => Object.assign(new Problem(409, code + (detail ? ': ' + detail : '')), { code });
const reads = new Set(['search-designs', 'get-design', 'get-design-pages', 'get-design-content', 'get-presenter-notes',
  'get-export-formats', 'search-folders', 'list-folder-items', 'list-brand-kits', 'search-brand-templates',
  'get-brand-template-dataset', 'get-design-dataset', 'get-assets', 'list-comments', 'list-replies', 'resolve-shortlink', 'help']);
const creations = new Set(['create-design', 'copy-design', 'create-design-from-brand-template', 'create-design-from-candidate',
  'import-design-from-url', 'autofill-design', 'resize-design']);
const edits = new Set(['perform-editing-operations', 'edit-design', 'commit-editing-transaction']);
const comments = new Set(['comment-on-design', 'reply-to-comment']);
const transactionTools = new Set(['start-editing-transaction', ...edits, 'cancel-editing-transaction', 'get-design-thumbnail']);
const fields = {
  'search-designs': ['query', 'ownership', 'sort_by', 'continuation', 'limit', 'design_types'],
  'get-design': ['design_id'], 'get-design-pages': ['design_id', 'offset', 'limit'],
  'get-design-content': ['design_id', 'content_types', 'page_numbers'], 'get-presenter-notes': ['design_id', 'page_numbers'],
  'get-export-formats': ['design_id'], 'search-folders': ['query', 'continuation', 'limit'],
  'list-folder-items': ['folder_id', 'continuation', 'item_types', 'sort_by', 'limit'],
  'list-brand-kits': ['continuation', 'limit'], 'search-brand-templates': ['query', 'continuation', 'limit', 'brand_kit_id', 'dataset', 'design_types'],
  'get-brand-template-dataset': ['brand_template_id', 'template_id'], 'get-design-dataset': ['design_id'],
  'get-assets': ['asset_ids'], 'list-comments': ['design_id', 'continuation', 'limit'],
  'list-replies': ['design_id', 'comment_id', 'thread_id', 'continuation', 'limit'], 'resolve-shortlink': ['url'], 'help': ['query', 'topic'],
  'create-design': ['brief', 'format', 'outline', 'references', 'brand_kit_id'],
  'copy-design': ['design_id', 'page_numbers'],
  'create-design-from-brand-template': ['brand_template_id', 'page_numbers'],
  'create-design-from-candidate': ['job_id', 'candidate_id'],
  'import-design-from-url': ['url', 'name', 'intended_design_type'],
  'autofill-design': ['design_id', 'brand_template_id', 'data', 'title'],
  'resize-design': ['design_id', 'design_type'],
  'start-editing-transaction': ['design_id'],
  'perform-editing-operations': ['transaction_id', 'operations', 'page_index'],
  'edit-design': ['transaction_id', 'operations', 'page_index', 'finalize', 'is_editable', 'is_empty', 'is_responsive'],
  'commit-editing-transaction': ['transaction_id'],
  'cancel-editing-transaction': ['transaction_id'],
  'get-design-thumbnail': ['transaction_id', 'page_index', 'design_id'],
  'comment-on-design': ['design_id', 'message', 'text'],
  'reply-to-comment': ['design_id', 'comment_id', 'thread_id', 'message', 'text'],
  'get-create-design-async-job': ['job_id', 'continuation_token'],
  'export-design': ['design_id', 'format'],
};

// Validate the actual provider schema as well as the reviewed operation contract.
// Unsupported schema constructs fail closed rather than silently weakening a write check.
export function validateCanvaArgs(schema, value, root = schema, depth = 0) {
  if (depth > 32 || schema === false) return false;
  if (schema === true) return true;
  if (!plain(schema)) return false;
  if (schema.$ref) {
    if (!/^#\/(\$defs|definitions)\/[A-Za-z0-9_-]+$/.test(schema.$ref)) return false;
    const [, group, key] = schema.$ref.split('/');
    return validateCanvaArgs(root[group]?.[key], value, root, depth + 1);
  }
  if (['not', 'if', 'then', 'else', 'dependentSchemas', 'patternProperties', 'unevaluatedProperties', 'contains'].some(k => k in schema)) return false;
  if (schema.anyOf && !schema.anyOf.some(s => validateCanvaArgs(s, value, root, depth + 1))) return false;
  if (schema.oneOf && schema.oneOf.filter(s => validateCanvaArgs(s, value, root, depth + 1)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every(s => validateCanvaArgs(s, value, root, depth + 1))) return false;
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) return false;
  const type = v => v === 'object' ? plain(value) : v === 'array' ? Array.isArray(value) : v === 'null' ? value === null :
    v === 'integer' ? Number.isSafeInteger(value) : v === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === v;
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type)) return false;
  if (typeof value === 'string') {
    if (value.length < (schema.minLength ?? 0) || value.length > Math.min(schema.maxLength ?? 32768, 32768)) return false;
    if (schema.pattern) { try { if (schema.pattern.length > 300 || !new RegExp(schema.pattern).test(value)) return false; } catch { return false; } }
  }
  if (typeof value === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > Math.min(schema.maxItems ?? 1000, 1000)) return false;
    if (!value.every(v => validateCanvaArgs(schema.items ?? {}, v, root, depth + 1))) return false;
  }
  if (plain(value)) {
    if ((schema.required ?? []).some(k => !Object.hasOwn(value, k))) return false;
    for (const [k, v] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) return false;
      const s = schema.properties?.[k] ?? schema.additionalProperties;
      if (s === false || !validateCanvaArgs(s ?? {}, v, root, depth + 1)) return false;
    }
  }
  return true;
}

export function canvaPayload(result) {
  if (result?.isError) throw error('canva_provider_operation_failed');
  let value = result?.structuredContent;
  if (!plain(value)) {
    const texts = result?.content?.filter(c => c.type === 'text').map(c => c.text) ?? [];
    if (texts.length !== 1) throw error('canva_resource_membership_unverifiable');
    try { value = JSON.parse(texts[0]); } catch { throw error('canva_resource_membership_unverifiable'); }
  }
  for (let n = 0; n < 3 && plain(value); n++) {
    if (plain(value.data)) value = value.data;
    else if (plain(value.result)) value = value.result;
    else return value;
  }
  if (!plain(value)) throw error('canva_resource_membership_unverifiable');
  return value;
}

function caller(ctx) {
  if (!id(ctx?.worker) || !id(ctx?.floor)) throw error('canva_caller_not_authorized');
  return { worker: ctx.worker, floor: ctx.floor };
}
function outputs(value) {
  const rows = value.designs ?? (value.design ? [value.design] : []);
  if (!Array.isArray(rows) || !rows.length || rows.some(d => !id(d?.id))) return [];
  return [...new Set(rows.map(d => d.id))];
}
function inspectTargets(args, design, transaction, depth = 0) {
  if (depth > 32) throw error('canva_tool_not_allowed');
  if (!args || typeof args !== 'object') return;
  for (const [k, v] of Object.entries(args)) {
    if (/(?:^|_)(?:folder_id|worker|floor|policy|access_token|connection_id)$/.test(k)) throw error('canva_tool_not_allowed');
    if (['design_id', 'target_design_id', 'destination_design_id'].includes(k) && v !== design) throw error('canva_write_outside_allowed_folder');
    if (k === 'transaction_id' && v !== transaction) throw error('canva_transaction_not_authorized');
    inspectTargets(v, design, transaction, depth + 1);
  }
}

export class CanvaPolicy {
  constructor({ directory, invoke, catalogue, account, now = Date.now }) {
    this.file = path.join(directory, 'canva-policy.json'); this.log = path.join(directory, 'canva-audit.jsonl');
    this.invoke = invoke; this.catalogue = catalogue; this.account = account; this.now = now; this.queue = Promise.resolve();
    this.state = { version: 1, policy: null, records: [] };
    try {
      const st = lstatSync(this.file, { throwIfNoEntry: false });
      if (st) {
        if (!st.isFile() || st.isSymbolicLink()) throw Error();
        const value = JSON.parse(readFileSync(this.file, 'utf8'));
        if (value?.version !== 1 || !Array.isArray(value.records) || value.records.length > 1000 ||
            value.records.some(r => !plain(r) || !id(r.id) || !id(r.worker) || !id(r.floor) || !id(r.connection) || !id(r.revision) || !Number.isFinite(r.at)) ||
            (value.policy && (!id(value.policy.folderId) || !id(value.policy.connection) || !id(value.policy.revision)))) throw Error();
        this.state = value;
      }
    } catch { this.unreadable = true; }
  }
  serial(action) {
    const job = this.queue.catch(() => {}).then(action);
    this.queue = job; return job;
  }
  save() {
    if (this.unreadable) throw error('canva_policy_unavailable');
    try {
      writeFileSync(this.file + '.tmp', JSON.stringify(this.state), { mode: 0o600, flush: true });
      renameSync(this.file + '.tmp', this.file);
    } catch { this.unreadable = true; throw error('canva_policy_unavailable'); }
  }
  audit(ctx, tool, outcome, resource, reason) {
    if (existsSync(this.log) && statSync(this.log).size > 1024 * 1024) {
      if (existsSync(this.log + '.1')) renameSync(this.log + '.1', this.log + '.2');
      renameSync(this.log, this.log + '.1');
    }
    appendFileSync(this.log, JSON.stringify({ timestamp: new Date(this.now()).toISOString(), worker: ctx?.worker,
      floor: ctx?.floor, tool, outcome, resource, folder: this.state.policy?.folderId, reason }) + '\n', { mode: 0o600 });
  }
  view(ctx) {
    const connection = this.account()?.connectionId;
    const policy = !this.unreadable && this.state.policy?.connection === connection ? this.state.policy : null;
    return { folderId: policy?.folderId ?? '', folderName: policy?.folderName ?? '', configured: !!policy,
      error: this.unreadable ? 'canva_policy_unavailable' : undefined,
      pending: this.state.records.filter(r => r.kind === 'creation' && !['completed', 'failed'].includes(r.stage) &&
        (!ctx || (r.worker === ctx.worker && r.floor === ctx.floor))).map(r => ({ id: r.id, stage: r.stage,
          worker: r.worker, floor: r.floor, outputIds: r.outputs ?? [], reason: r.reason, currentAccount: r.connection === connection })) };
  }
  configured() {
    const policy = this.state.policy;
    if (this.unreadable || !policy || policy.connection !== this.account()?.connectionId) throw error('canva_policy_not_configured');
    return policy;
  }
  async raw(name, args, connection) {
    if (connection && this.account()?.connectionId !== connection) throw error('canva_connection_changed');
    return this.invoke('canva.' + name, args, connection);
  }
  async member(resource, policy = this.configured()) {
    if (!id(resource)) throw error('canva_resource_membership_unverifiable');
    const cursors = new Set(); let continuation;
    do {
      const page = canvaPayload(await this.raw('list-folder-items', { folder_id: policy.folderId, item_types: ['design', 'image'],
        ...(continuation ? { continuation } : {}), user_intent: 'Verify the configured Canva write boundary' }, policy.connection));
      if (!Array.isArray(page.items)) throw error('canva_resource_membership_unverifiable');
      if (page.items.some(item => ['design', 'image'].includes(item?.type) && (item[item.type]?.id ?? item.id) === resource)) return true;
      continuation = page.continuation ?? page.next_continuation;
      if (continuation !== undefined && (typeof continuation !== 'string' || !continuation || cursors.has(continuation) || cursors.size >= 1000))
        throw error('canva_resource_membership_unverifiable');
      if (continuation) cursors.add(continuation);
    } while (continuation);
    return false;
  }
  async requireMember(resource, policy) {
    if (!await this.member(resource, policy)) throw error('canva_write_outside_allowed_folder');
  }
  setPolicy(folderId, folderName) {
    return this.serial(async () => {
      if (!id(folderId) || folderId === 'root' || typeof folderName !== 'string' || !folderName.trim() || folderName.length > 180)
        throw error('canva_invalid_folder');
      if (this.unreadable) throw error('canva_policy_unavailable');
      const connection = this.account()?.connectionId;
      if (!id(connection)) throw error('canva_connection_changed');
      const seen = new Set(); let continuation, found = false;
      do {
        const p = canvaPayload(await this.raw('search-folders', { query: folderName.trim(), ...(continuation ? { continuation } : {}),
          user_intent: 'Verify the administrator-selected Canva folder' }, connection));
        const rows = p.folders ?? p.items;
        if (!Array.isArray(rows)) throw error('canva_resource_membership_unverifiable');
        found ||= rows.some(f => (f.id ?? f.folder?.id) === folderId && (f.name ?? f.folder?.name) === folderName.trim());
        continuation = p.continuation ?? p.next_continuation;
        if (continuation && (typeof continuation !== 'string' || seen.has(continuation) || seen.size >= 1000)) throw error('canva_resource_membership_unverifiable');
        if (continuation) seen.add(continuation);
      } while (continuation && !found);
      if (!found) throw error('canva_invalid_folder');
      const policy = { folderId, folderName: folderName.trim(), connection, revision: randomUUID() };
      await this.member('__verification__', policy); // Establish that listing is available and well formed, even on an empty folder.
      this.state.policy = policy; this.save(); this.audit(null, 'configure', 'success', folderId);
      return this.view();
    });
  }
  async tools() {
    const configured = this.view().configured;
    return (await this.catalogue()).filter(t => {
      const name = t.name.slice(6);
      const reviewed = fields[name];
      if (reviewed && Object.keys(t.inputSchema.properties ?? {}).some(k => ![...reviewed, 'user_intent'].includes(k))) return false;
      return reads.has(name) || name === 'export-design' || (configured && ((creations.has(name) && name !== 'create-design-from-candidate') || transactionTools.has(name) || comments.has(name) ||
        ['export-design', 'get-create-design-async-job'].includes(name)));
    }).map(t => ({ ...t, description: t.description + '\nOffice policy: existing resources are writable only directly in the configured folder. New designs are moved there automatically. Unknown operations are denied.' }))
      .concat([{ name: 'canva.creation-status', description: 'Read your own pending Canva creations; never starts a new creation.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false } }]);
  }
  call(name, args, ctx) {
    return this.serial(async () => {
      const actor = caller(ctx), tool = name.slice(6);
      const resource = id(args?.design_id) ? args.design_id : id(args?.transaction_id) ? args.transaction_id : undefined;
      try { this.audit(actor, tool, 'attempt', resource); const result = await this.perform(tool, args, actor); this.audit(actor, tool, 'success', resource); return result; }
      catch (e) { this.audit(actor, tool, 'blocked_or_failed', resource, e.code ?? 'canva_provider_unavailable'); throw e; }
    });
  }
  capacity() {
    this.state.records = this.state.records.filter(r => !['completed', 'failed', 'closed'].includes(r.stage) || this.now() - r.at < 24 * 3600_000);
    if (this.state.records.length >= 1000) throw error('canva_policy_storage_full');
  }
  acceptOutputs(record, value) {
    const ids = outputs(value);
    if (!ids.length || ids.some(x => record.sources?.includes(x) || this.state.records.some(r => r !== record && r.outputs?.includes(x))))
      throw error('canva_creation_outcome_unknown');
    record.outputs = ids;
  }
  async perform(tool, args, ctx) {
    if (!plain(args)) throw error('canva_invalid_arguments');
    if (tool === 'creation-status') {
      if (Object.keys(args).length) throw error('canva_invalid_arguments');
      return { content: [{ type: 'text', text: JSON.stringify(this.view(ctx)) }] };
    }
    const advertised = (await this.catalogue()).find(t => t.name === 'canva.' + tool);
    if (!advertised || !validateCanvaArgs(advertised.inputSchema, args)) throw error('canva_tool_not_allowed');
    if (!fields[tool] && tool !== 'export-design') throw error('canva_tool_not_allowed');
    if (fields[tool] && Object.keys(args).some(k => ![...fields[tool], 'user_intent'].includes(k))) throw error('canva_tool_not_allowed');
    if (reads.has(tool)) return this.raw(tool, args);
    if (tool === 'export-design') {
      if (!id(args.design_id)) throw error('canva_tool_not_allowed');
      return this.raw(tool, args);
    }
    const policy = this.configured();
    if (tool === 'get-create-design-async-job') {
      const record = this.record(args.job_id, ctx, 'creation', 'job');
      await this.advance(record); return this.creationResult(record);
    }
    if (creations.has(tool)) {
      // Candidate generation can create additional provider assets. It is not enabled without a reviewed output contract.
      if (tool === 'create-design-from-candidate') throw error('canva_creation_finalization_unsupported');
      const move = (await this.catalogue()).find(t => t.name === 'canva.move-item-to-folder');
      if (!move || !validateCanvaArgs(move.inputSchema, { item_id: 'probe', to_folder_id: policy.folderId,
        user_intent: 'Finalize the new Office design in its configured folder' })) throw error('canva_creation_finalization_unsupported');
      // Creation sources are read-only. Nested target/folder overrides are never a source reference.
      for (const k of Object.keys(args)) if (/folder|policy|worker|connection/.test(k)) throw error('canva_tool_not_allowed');
      const sources = [args.design_id, args.brand_template_id, ...(Array.isArray(args.references) ? args.references : [])].filter(x => x !== undefined);
      if (sources.some(x => !id(x))) throw error('canva_invalid_arguments');
      await this.member('__verification__', policy);
      const fingerprint = createHash('sha256').update(JSON.stringify({ tool, args, ...ctx, connection: policy.connection })).digest('hex');
      if (this.state.records.some(r => r.fingerprint === fingerprint && !['completed', 'failed'].includes(r.stage))) throw error('canva_creation_pending_finalization');
      this.capacity();
      const record = { id: randomUUID(), kind: 'creation', ...ctx, connection: policy.connection, revision: policy.revision,
        folder: policy.folderId, fingerprint, tool, sources, stage: 'outcome_unknown', at: this.now() };
      this.state.records.push(record); this.save();
      try {
        const result = await this.raw(tool, args, record.connection);
        if (result.isError) { record.stage = 'failed'; this.save(); return result; }
        const value = canvaPayload(result);
        if (value.status === 'failed') { record.stage = 'failed'; this.save(); return this.creationResult(record, result); }
        const immediateOutputs = outputs(value);
        const job = value.job ?? value;
        if (id(job.job_id ?? job.id) && (!immediateOutputs.length || ['pending', 'in_progress'].includes(job.status))) {
          if (tool !== 'create-design') throw error('canva_creation_finalization_unsupported');
          record.job = job.job_id ?? job.id; record.token = job.continuation_token;
          if (typeof record.token !== 'string' || !record.token || record.token.length > 65536) throw error('canva_creation_outcome_unknown');
          record.next = this.now() + Math.max(1000, (job.polling_policy?.wait_seconds ?? 10) * 1000); record.stage = 'creating';
          this.save(); return this.creationResult(record, result);
        }
        this.acceptOutputs(record, value);
        record.stage = 'pending_finalization'; this.save(); await this.finalize(record);
        return this.creationResult(record, result);
      } catch (e) { record.reason = e.code ?? 'canva_provider_unavailable'; this.save(); throw error(record.outputs?.length ? 'canva_creation_pending_finalization' : 'canva_creation_outcome_unknown', record.id); }
    }
    if (tool === 'start-editing-transaction') {
      this.capacity();
      await this.requireMember(args.design_id, policy);
      const record = { id: randomUUID(), kind: 'transaction', design: args.design_id, ...ctx,
        connection: policy.connection, revision: policy.revision, at: this.now(), stage: 'outcome_unknown' };
      this.state.records.push(record); this.save();
      const result = await this.raw(tool, args, policy.connection), value = canvaPayload(result);
      const tid = value.transaction_id ?? value.transaction?.id;
      if (!id(tid) || this.state.records.some(r => r.transaction === tid)) throw error('canva_transaction_not_authorized');
      record.transaction = tid; record.stage = 'open'; this.save(); return result;
    }
    if (transactionTools.has(tool)) {
      const cancel = tool === 'cancel-editing-transaction' || (tool === 'edit-design' && args.finalize === 'cancel');
      const r = this.record(args.transaction_id, ctx, 'transaction', 'transaction', cancel);
      inspectTargets(args, r.design, r.transaction);
      if (cancel && args.operations?.length) throw error('canva_tool_not_allowed');
      if (!cancel) await this.requireMember(r.design, policy);
      const mutates = tool !== 'get-design-thumbnail';
      if (mutates) { r.stage = 'outcome_unknown'; this.save(); }
      const result = await this.raw(tool, args, policy.connection);
      if (mutates && !result.isError) { r.stage = cancel || tool === 'commit-editing-transaction' || args.finalize === 'commit' ? 'closed' : 'open'; this.save(); }
      return result;
    }
    if (comments.has(tool)) {
      inspectTargets(args, args.design_id, undefined); await this.requireMember(args.design_id, policy);
      if (tool === 'reply-to-comment') {
        const target = args.comment_id ?? args.thread_id;
        if (!id(target)) throw error('canva_transaction_not_authorized');
        let continuation, found = false; const cursors = new Set();
        do {
          const p = canvaPayload(await this.raw('list-comments', { design_id: args.design_id, ...(continuation ? { continuation } : {}) }, policy.connection));
          if (!Array.isArray(p.comments ?? p.items)) throw error('canva_transaction_not_authorized');
          found ||= (p.comments ?? p.items).some(c => (c.id ?? c.comment_id ?? c.thread_id) === target);
          continuation = p.continuation;
          if (continuation && (typeof continuation !== 'string' || cursors.has(continuation) || cursors.size >= 1000)) throw error('canva_transaction_not_authorized');
          if (continuation) cursors.add(continuation);
        } while (continuation && !found);
        if (!found) throw error('canva_transaction_not_authorized');
        await this.requireMember(args.design_id, policy);
      }
      return this.raw(tool, args, policy.connection);
    }
    throw error('canva_tool_not_allowed');
  }
  record(value, ctx, kind, key, cancel = false) {
    const p = this.configured();
    const r = this.state.records.find(r => r.kind === kind && r[key] === value && r.worker === ctx.worker && r.floor === ctx.floor &&
      r.connection === p.connection && r.revision === p.revision && this.now() - r.at < 24 * 3600_000 &&
      (kind !== 'transaction' || r.stage === 'open' || (cancel && r.stage === 'outcome_unknown')));
    if (!r) throw error('canva_transaction_not_authorized');
    return r;
  }
  creationResult(record, result) {
    const status = { operation_id: record.id, status: record.stage, design_ids: record.outputs ?? [], folder_id: record.folder,
      ...(record.job ? { job_id: record.job } : {}), ...(record.reason ? { reason: record.reason } : {}) };
    return result ? { ...result, office_creation: status, content: [...result.content, { type: 'text', text: JSON.stringify({ office_creation: status }) }] }
      : { content: [{ type: 'text', text: JSON.stringify(status) }], structuredContent: status };
  }
  async finalize(record) {
    const p = this.configured();
    if (p.connection !== record.connection || p.revision !== record.revision || p.folderId !== record.folder) throw error('canva_connection_changed');
    for (const output of record.outputs) {
      if (!await this.member(output, p)) {
        if (record.moveUncertain === output) throw error('canva_creation_pending_finalization');
        record.moveUncertain = output; this.save();
        const result = await this.raw('move-item-to-folder', { item_id: output, to_folder_id: p.folderId,
          user_intent: 'Finalize the new Office design in its configured folder' }, record.connection);
        if (result.isError) { delete record.moveUncertain; this.save(); throw error('canva_creation_pending_finalization'); }
      }
      await this.requireMember(output, p); delete record.moveUncertain; this.save();
    }
    record.stage = 'completed'; delete record.reason; this.save(); this.audit(record, record.tool, 'finalized', record.id);
  }
  async advance(record) {
    const p = this.configured();
    if (record.connection !== p.connection || record.revision !== p.revision) throw error('canva_connection_changed');
    if (record.stage === 'creating') {
      if (record.next > this.now()) return;
      if (!record.token) throw error('canva_creation_outcome_unknown');
      const result = await this.raw('get-create-design-async-job', { job_id: record.job, continuation_token: record.token,
        user_intent: 'Finish the pending Office design creation' }, record.connection);
      const value = canvaPayload(result);
      if (value.job_id && value.job_id !== record.job) throw error('canva_transaction_not_authorized');
      if (value.status === 'failed') { record.stage = 'failed'; this.save(); return; }
      record.token = value.continuation_token ?? record.token;
      record.next = this.now() + Math.max(1000, (value.polling_policy?.wait_seconds ?? 10) * 1000);
      if (value.status === 'completed') {
        this.acceptOutputs(record, value);
        record.stage = 'pending_finalization';
      }
      this.save();
    }
    if (record.stage === 'pending_finalization') await this.finalize(record);
  }
  tick() {
    return this.serial(async () => {
      const p = this.view(); if (!p.configured) return;
      const r = this.state.records.find(r => r.kind === 'creation' && r.stage === 'creating' && r.next <= this.now() &&
        this.now() - r.at < 24 * 3600_000 && r.connection === this.account()?.connectionId);
      if (!r) return;
      try { await this.advance(r); } catch (e) { r.reason = e.code ?? 'canva_provider_unavailable'; r.next = this.now() + 60_000; this.save(); this.audit(r, r.tool, 'pending', r.id, r.reason); }
    });
  }
  reconcile(operationId) {
    return this.serial(async () => {
      const p = this.configured(), r = this.state.records.find(r => r.kind === 'creation' && r.id === operationId &&
        r.connection === p.connection && r.revision === p.revision);
      if (!r) throw error('canva_transaction_not_authorized');
      await this.advance(r); return this.view();
    });
  }
}
