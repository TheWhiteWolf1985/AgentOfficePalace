import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Whiteboard } from '../src/server/whiteboard.js';
import { whiteboardAt } from '../src/server/office/whiteboards.js';
import type { Ctx } from '../src/server/office/context.js';
import { WB_MAX_ELEMENT_BYTES } from '../src/shared/whiteboard.js';
import { freshPending, readyToPublish } from '../src/client/features/whiteboard/sync.js';

test('meeting drawing and pictures persist independently, including deletion and explicit shutdown flush', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aop-whiteboard-'));
  const roomDir = path.join(dir, 'shared', 'conference-room');
  const room = new Whiteboard(roomDir), a = new Whiteboard(path.join(dir, 'a')), b = new Whiteboard(path.join(dir, 'b'));
  try {
    const picture = { id: 'same', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 1 };
    const element = { id: 'same', type: 'image', fileId: picture.id, version: 1, versionNonce: 20, updated: Date.now() };
    for (const [i, board] of [room, a, b].entries()) {
      assert.equal(board.addFile(picture), undefined);
      board.apply([{ ...element, x: i }]);
    }
    room.apply([{ ...element, x: 55, versionNonce: 10 }]);
    assert.equal(room.scene()[0].x, 55, 'lower nonce wins concurrent versions');
    assert.equal(room.apply([{ ...element, x: 66 }]).accepted.length, 0, 'losing concurrent value is ignored');
    room.apply([{ ...element, version: 2, versionNonce: 1, isDeleted: true }]);
    assert.equal(room.empty, true); assert.equal(a.empty, false);
    room.apply([{ ...element, version: 3, versionNonce: 2, x: 77 }]); // undo restores same element
    room.flush(); a.flush(); b.flush();
    const restored = new Whiteboard(roomDir);
    assert.equal(restored.scene()[0].x, 77); assert.deepEqual(restored.file('same'), picture);
    assert.equal(new Whiteboard(path.join(dir, 'a')).scene()[0].x, 1);
    assert.equal(new Whiteboard(path.join(dir, 'b')).scene()[0].x, 2);
    assert.deepEqual(JSON.parse(readFileSync(path.join(roomDir, 'whiteboard/elements.json'), 'utf8')), restored.scene());
    assert.equal(existsSync(path.join(roomDir, 'whiteboard/elements.json.tmp')), false, 'atomic replacement completed');
    const ctx = { conferenceWhiteboard: restored, floors: new Map([['a', { whiteboard: a }], ['b', { whiteboard: b }]]) } as unknown as Ctx;
    assert.equal(whiteboardAt(ctx, '@roof'), restored); assert.equal(whiteboardAt(ctx, 'a'), a);
    for (const id of ['@lobby', '../shared/conference-room', '', 'unknown']) assert.equal(whiteboardAt(ctx, id), undefined);
    ctx.floors.clear(); assert.equal(whiteboardAt(ctx, '@roof'), restored, 'last project removal cannot remove shared drawing');
    assert.equal(room.apply([{ ...element, version: 99, text: 'x'.repeat(WB_MAX_ELEMENT_BYTES) }]).accepted.length, 0);
    assert.equal(room.addFile({ ...picture, id: '../escape' }), 'Bad picture id');
  } finally { room.flush(); a.flush(); b.flush(); rmSync(dir, { recursive: true, force: true }); }
});

test('async text and image initialization reaches shared storage without publishing incomplete same-version placeholders', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aop-whiteboard-initializing-'));
  const board = new Whiteboard(dir);
  try {
    const text = { id: 'typing', type: 'text', text: '', version: 1, versionNonce: 10 };
    const image = { id: 'loading', type: 'image', fileId: null as string | null, width: 100, height: 100, version: 1, versionNonce: 10 };
    const send = (elements: typeof text[] | typeof image[]) => board.apply(elements.filter(readyToPublish));
    send([text]); send([image]);
    assert.deepEqual(board.scene(), [], 'a second editor never receives and cleans up the new empty text');
    send([{ ...text, text: 'Shared typing' }]);
    assert.equal(board.scene().find(e => e.id === text.id)?.text, 'Shared typing');
    assert.equal(board.addFile({ id: 'picture', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA', created: 1 }), undefined);
    const initialized = { ...image, fileId: 'picture', width: 160, height: 80 };
    send([freshPending(image, initialized)]);
    assert.equal(board.scene().find(e => e.id === image.id)?.fileId, 'picture', 'completed image is accepted at the original version/nonce');
    assert.equal(freshPending({ ...text, version: 3, text: 'Latest edit' }, { ...text, version: 2 }).text, 'Latest edit', 'an older API snapshot cannot replace queued work');
    const deleted = { ...text, version: 2, text: '', isDeleted: true, updated: Date.now() };
    assert.ok(readyToPublish(deleted)); board.apply([deleted]);
    board.flush();
    const restored = new Whiteboard(dir);
    assert.equal(restored.scene().find(e => e.id === image.id)?.width, 160);
    assert.equal(restored.scene().find(e => e.id === text.id)?.isDeleted, true, 'empty text deletions must still propagate');
  } finally { board.flush(); rmSync(dir, { recursive: true, force: true }); }
});
