import test from 'node:test';
import assert from 'node:assert/strict';
import { whereabouts } from '../src/client/ui/whereabouts.js';
import type { PeerInfo } from '../src/shared/protocol.js';
import { ROOF } from '../src/shared/rooftop.js';

function peer(x: number, z: number, floor?: string, y = 0): PeerInfo {
  return { id: 'p', name: 'P', color: '#fff', look: { skin: 0, hair: 0, style: 0 }, x, y, z, rotY: 0, moving: false, voice: false, muted: false, sharing: false, floor };
}

test('the shared room and its modeled seats have work-oriented descriptions', () => {
  assert.equal(whereabouts(peer(10, 9, 'agent-office')), '🤝 in the meeting room');
  for (const [x, z] of [[10, 9], [0, 3], [-12, -10]]) assert.equal(whereabouts(peer(x, z, ROOF)), '🤝 in the meeting room');
  assert.equal(whereabouts({ ...peer(-8.48, 6, ROOF), seat: 'seat_001:0' }), '🪑 on the meeting seat');
});

test('someone on the 2D view is on the 2D view, unless they have something open', () => {
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true }), '📱 on the 2D view');
  assert.equal(whereabouts({ ...peer(0, 0, 'agent-office'), lite: true, doing: "💻 in Pixel's terminal" }), "💻 in Pixel's terminal");
});
