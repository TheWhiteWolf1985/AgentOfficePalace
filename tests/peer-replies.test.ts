import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PeerRequests } from '../src/server/peer-requests.js';
import { writeCodexHook } from '../src/server/codex.js';

test('a colleague gets the actual negative answer to its own request after a restart', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-requests-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const requests = new PeerRequests(dir);
  const id = requests.start('byte', 'pixel', 'juri', () => true)!;
  const second = requests.start('other', 'byte', 'juri', () => true)!;
  const turn = { session_id: 'session', turn_id: 'turn-1' };
  const stop = (turnId: string) => requests.hook('pixel', 'juri', 'Stop', { ...turn, turn_id: turnId });
  assert.equal(stop('turn-1'), undefined);
  requests.hook('pixel', 'juri', 'UserPromptSubmit', { ...turn, prompt: '[Office request ' + id + '] weather?' });
  assert.equal(stop('unrelated-turn'), undefined);
  assert.equal(stop('turn-1'), id);
  const restored = new PeerRequests(dir);
  assert.equal(restored.result(id, 'other', 'juri'), undefined);
  assert.equal(restored.result(id, 'byte', 'other-owner'), undefined);
  assert.equal(restored.answer(id, 'byte', 'juri', 'wrong agent'), false);
  assert.equal(restored.answer(id, 'pixel', 'other-owner', 'wrong owner'), false);
  const answer = 'Non posso osservare il meteo dalla finestra.';
  assert.ok(restored.answer(id, 'pixel', 'juri', answer));
  assert.ok(restored.answer(id, 'pixel', 'juri', answer));
  assert.equal(restored.answer(id, 'pixel', 'juri', 'different message'), false);
  assert.equal(new PeerRequests(dir).result(id, 'byte', 'juri')?.reply, answer);
  assert.equal(restored.result(second, 'other', 'juri')?.status, 'pending');
});

test('busy, interrupted and empty turns never masquerade as an answer', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-requests-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const requests = new PeerRequests(dir);
  assert.equal(requests.start('byte', 'pixel', 'owner', () => false), undefined);
  const id = requests.start('byte', 'pixel', 'owner', () => true)!;
  const event = { session_id: 'thread', turn_id: 'turn', prompt: '[Office request ' + id + '] question' };
  requests.hook('pixel', 'owner', 'UserPromptSubmit', event);
  requests.hook('pixel', 'owner', 'Interrupt', event);
  assert.match(requests.result(id, 'byte', 'owner')!.error!, /interrupted/);
  assert.equal(requests.hook('pixel', 'owner', 'Stop', event), undefined);
  const next = requests.start('byte', 'pixel', 'owner', () => true)!;
  assert.ok(requests.answer(next, 'pixel', 'owner', ''));
  assert.equal(requests.result(next, 'byte', 'owner')?.status, 'failed');
});

test('the Docker Stop hook returns only the requested final answer to the caller', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reply-hook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const requests = new PeerRequests(dir);
  const id = requests.start('byte', 'pixel', 'owner', () => true)!;
  const socket = process.platform === 'win32' ? '//./pipe/office-' + id : path.join(dir, 'hooks.sock');
  const delivered: string[] = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const data = JSON.parse(raw);
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(req.headers.authorization, 'Bearer test-token');
    assert.equal(url.searchParams.get('worker'), 'pixel');
    if (url.pathname === '/hooks/codex') {
      assert.equal(data.last_assistant_message, undefined);
      res.end(JSON.stringify({ requestId: requests.hook('pixel', 'owner', url.searchParams.get('event')!, data) }));
    } else {
      assert.equal(url.pathname, '/office/workers/reply');
      assert.equal(data.requestId, id);
      assert.ok(requests.answer(id, 'pixel', 'owner', data.reply));
      delivered.push(data.reply);
      res.end('{}');
    }
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const helper = writeCodexHook(dir);
  async function hook(event: string, data: Record<string, string>) {
    const child = spawn(process.execPath, [helper, event], { env: {
      ...process.env, AGENT_OFFICE_HOOK_SOCKET: socket, AGENT_OFFICE_WORKER_ID: 'pixel', AGENT_OFFICE_HOOK_TOKEN: 'test-token',
    } });
    const output: Buffer[] = [];
    child.stdout.on('data', c => output.push(c));
    const done = new Promise<void>((resolve, reject) => {
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error('Hook exit ' + code)));
    });
    child.stdin.end(JSON.stringify({ session_id: 'root', turn_id: 'weather', ...data }));
    await done;
    return JSON.parse(Buffer.concat(output).toString());
  }
  const { hookSpecificOutput } = await hook('UserPromptSubmit', { prompt: '[Office request ' + id + '] meteo?' });
  assert.equal(hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(hookSpecificOutput.additionalContext, /list_office_tools/);
  assert.match(hookSpecificOutput.additionalContext, /node \/office-bridge\/office-workers\.mjs tools/);
  assert.ok(!hookSpecificOutput.additionalContext.includes(id));
  assert.deepEqual(await hook('Stop', { turn_id: 'other', last_assistant_message: 'private unrelated answer' }), {});
  await hook('Stop', { last_assistant_message: 'Non posso osservare il meteo.' });
  assert.deepEqual(delivered, ['Non posso osservare il meteo.']);
  assert.equal(requests.result(id, 'byte', 'owner')?.reply, delivered[0]);
});
