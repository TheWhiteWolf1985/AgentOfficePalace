import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pluginFile } from '../src/server/plugin-service.js';

test('file tools can read exactly the authenticated workspace and attachments', { skip: process.platform !== 'linux' }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'office-file-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const roots = { workspace: path.join(dir, 'work'), drops: path.join(dir, 'drops') };
  await mkdir(roots.workspace);
  await mkdir(roots.drops);
  await writeFile(path.join(roots.workspace, 'input.pdf'), 'work');
  await writeFile(path.join(roots.drops, 'input.pdf'), 'drop');
  await writeFile(path.join(dir, 'other.pdf'), 'private');
  await symlink(dir, path.join(roots.workspace, 'outside'));
  await link(path.join(dir, 'other.pdf'), path.join(roots.workspace, 'link.pdf'));
  const read = (file: string) => pluginFile('pdf.text', { file, page: 2 }, roots, async (op, _, attachment) => {
    assert.equal(op, 'worker/file');
    assert.deepEqual(JSON.parse(Buffer.from(attachment!.options, 'base64url').toString()), { page: 2 });
    const chunks = [];
    for await (const piece of attachment!.stream) chunks.push(piece);
    return Buffer.concat(chunks).toString();
  });
  assert.equal(await read('input.pdf'), 'work');
  assert.equal(await read('/workspace/input.pdf'), 'work');
  assert.equal(await read('/office-drops/input.pdf'), 'drop');
  for (const file of ['../other.pdf', 'outside/other.pdf', '/workspace/link.pdf', '/office-drops/../other.pdf',
    path.join(dir, 'other.pdf'), '.git/config', 'missing.pdf', 'outside', 'dir\\other.pdf']) {
    await assert.rejects(read(file), { status: 400 });
  }
  await truncate(path.join(roots.workspace, 'input.pdf'), 16 * 1024 * 1024 + 1);
  await assert.rejects(read('input.pdf'), { status: 413 });
});
