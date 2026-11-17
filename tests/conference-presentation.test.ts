import test from 'node:test';
import assert from 'node:assert/strict';
import { ConferencePresentation } from '../src/server/conference-presentation.js';
import { presentationHandlers, presentationHooks } from '../src/server/ws/handlers/presentation.js';
import { presenceHandlers } from '../src/server/ws/handlers/presence.js';
import { presentationFit } from '../src/shared/presentation-fit.js';
import { spaceActionAvailable, spaceCapabilities, spacePanelAvailable, sameMediaSpace } from '../src/shared/space-capabilities.js';
import { ROOF, LOBBY } from '../src/shared/rooftop.js';
import type { Ctx } from '../src/server/office/context.js';
import type { Client } from '../src/server/office/client.js';

test('common spaces expose only usable commands and retain project controls inside an office', () => {
  for (const floor of [null, LOBBY, ROOF]) {
    const c = spaceCapabilities(floor, true);
    for (const action of ['issues', 'pulls', 'queue', 'services', 'meeting', 'decor', 'search']) assert.equal(spaceActionAvailable(action, c), false);
    for (const action of ['settings', 'elevator', 'voice', 'share', 'accounts']) assert.equal(spaceActionAvailable(action, c), true);
    assert.equal(spacePanelAvailable('workers', c), false); assert.equal(spacePanelAvailable('chat', c), true);
    assert.equal(spaceActionAvailable('whiteboard', c), floor === ROOF); assert.equal(spaceActionAvailable('presentation', c), floor === ROOF);
  }
  const c = spaceCapabilities('project1', true);
  for (const action of ['issues', 'meeting', 'decor', 'whiteboard']) assert.equal(spaceActionAvailable(action, c), true);
  assert.equal(spaceCapabilities('project1', false).project, false);
  assert.equal(sameMediaSpace(ROOF, LOBBY), false); assert.equal(sameMediaSpace(ROOF, ROOF), true); assert.equal(sameMediaSpace(null, null), false);
});

test('presentation requires a screen shared by a room participant, is room-scoped and releases on stop/leave/disconnect', () => {
  const presentation = new ConferencePresentation(), sent: { id: string; mode: string }[] = [], warnings: string[] = [];
  const client = (id: string, floor: string, sharing: boolean) => ({ id, peer: { id, floor, sharing, voice: false, muted: false } }) as Client;
  const a = client('a', ROOF, true), b = client('b', ROOF, false), outside = client('outside', LOBBY, true);
  const ctx = { conferencePresentation: presentation, clients: new Map([['a', a], ['b', b], ['outside', outside]]), sendTo: (c: Client, m: any) => sent.push({ id: c.id, mode: m.state.mode }), warn: (_c: Client, text: string) => warnings.push(text), broadcast: () => {} } as unknown as Ctx;
  const present = { t: 'conference.present', mode: 'presentation' } as const;
  presentationHandlers['conference.present'](ctx, outside, present); presentationHandlers['conference.present'](ctx, b, present);
  assert.equal(warnings.length, 2); assert.equal(presentation.state().mode, 'whiteboard');
  presentationHandlers['conference.present'](ctx, a, present);
  assert.equal(presentation.state().presenter, 'a'); assert.deepEqual(sent.map(s => s.id), ['a', 'b']);
  const revision = presentation.state().revision;
  presenceHandlers.voice(ctx, a, { t: 'voice', voice: false, muted: false, sharing: false });
  assert.equal(presentation.state().mode, 'whiteboard'); assert.ok(presentation.state().revision > revision);
  a.peer.sharing = true; presentationHandlers['conference.present'](ctx, a, present); presentationHooks.leaving!(ctx, a, undefined); assert.equal(presentation.state().mode, 'whiteboard');
  presentationHandlers['conference.present'](ctx, a, present); presentationHooks.closed!(ctx, a); assert.equal(presentation.state().mode, 'whiteboard');
  assert.equal(new ConferencePresentation().state().mode, 'whiteboard', 'startup never restores a nonexistent media stream');
});

test('wide writing panel letterboxes common video ratios without stretching or cropping', () => {
  const board = 8 / 2.7;
  const wide = presentationFit(board, 16 / 9); assert.equal(wide.y, 1); assert.ok(Math.abs(board / wide.x - 16 / 9) < 1e-9);
  const portrait = presentationFit(board, 9 / 16); assert.ok(Math.abs(board / portrait.x - 9 / 16) < 1e-9);
  const ultrawide = presentationFit(board, 4); assert.equal(ultrawide.x, 1); assert.ok(Math.abs(board * ultrawide.y - 4) < 1e-9);
  assert.deepEqual(presentationFit(board, 0), { x: 1, y: 1 });
});
