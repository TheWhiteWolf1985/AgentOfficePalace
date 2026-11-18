import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Voice } from '../src/client/voice.js';
import { store } from '../src/client/state/index.js';
import type { Net } from '../src/client/net.js';

class Track extends EventTarget {
  readyState = 'live'; muted = false; enabled = true;
  constructor(readonly kind = 'audio') { super(); }
  stop() { this.readyState = 'ended'; }
  end() { this.stop(); this.dispatchEvent(new Event('ended')); }
  mute(muted: boolean) { this.muted = muted; this.dispatchEvent(new Event(muted ? 'mute' : 'unmute')); }
}
class Stream {
  constructor(readonly tracks = [new Track()]) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
}
class Context extends EventTarget {
  static all: Context[] = [];
  state = 'running'; reads = 0; disconnected = 0;
  constructor() { super(); Context.all.push(this); }
  resume() { return Promise.resolve(); }
  createMediaStreamSource() { return { connect() {}, disconnect: () => this.disconnected++ }; }
  createAnalyser() { return { fftSize: 0, getByteTimeDomainData: (b: Uint8Array) => { this.reads++; b.fill(160); } }; }
  change(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class PC {
  ontrack?: (event: any) => void; closed = false; removed = 0;
  addTrack() { return {}; }
  removeTrack() { this.removed++; }
  close() { this.closed = true; }
}
function fixture(t: TestContext) {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); };
  const mic = new Stream(), screen = new Stream([new Track('video')]), document = Object.assign(new EventTarget(), { hidden: false });
  const timers = new Map<number, () => void>(); let next = 0;
  install('document', document); install('window', { isSecureContext: true });
  install('navigator', { mediaDevices: { getUserMedia: async () => mic, getDisplayMedia: async () => screen } });
  install('AudioContext', Context); install('RTCPeerConnection', PC); install('MediaStream', Stream);
  install('Audio', class { autoplay = false; srcObject: unknown = null; volume = 1; play() { return Promise.resolve(); } });
  install('setInterval', (fn: () => void, ms: number) => { assert.equal(ms, 40); timers.set(++next, fn); return next; });
  install('clearInterval', (id: number) => timers.delete(id));
  const savedPeers = new Map(store.peers), you = store.you; store.peers.clear(); store.you = 'local'; Context.all = [];
  const sent: unknown[] = [], voice = new Voice({ send: (msg: unknown) => sent.push(msg) } as Net);
  t.after(() => {
    voice.leaveVoice(); voice.stopShare(); voice.reset();
    store.peers.clear(); for (const [id, p] of savedPeers) store.peers.set(id, p); store.you = you;
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name]; }
  });
  const peer = (id = 'remote') => { const p = { id, lite: false, voice: true, muted: false, floor: store.floor } as any; store.peers.set(id, p); voice.syncPeers(); return p; };
  const receive = (kind = 'audio', id = 'remote') => { const stream = new Stream([new Track(kind)]); (voice.conns.get(id)!.pc as unknown as PC).ontrack!({ track: stream.tracks[0], streams: [stream] }); return stream.tracks[0]; };
  return { voice, mic, document, timers, sent, peer, receive, tick: () => { for (const fn of timers.values()) fn(); } };
}

test('voice levels do no periodic work for idle peers or screen-only sharing', async t => {
  const f = fixture(t); assert.equal(f.timers.size, 0);
  f.peer(); f.receive('video');
  assert.equal(await f.voice.startShare(), null);
  f.voice.syncPeers(); assert.equal(f.timers.size, 0);
  assert.equal(f.voice.sharing, true); assert.equal(f.voice.remoteScreens().size, 0);
  f.voice.stopShare(); f.voice.reset(); assert.equal(f.timers.size, 0);
});

test('microphone sampling starts once and follows mute, push-to-talk, track state and leave', async t => {
  const f = fixture(t); assert.equal(await f.voice.joinVoice(true), null);
  assert.equal(f.timers.size, 0); assert.equal(Context.all[0].reads, 0);
  f.voice.startTalking(); assert.equal(f.timers.size, 1); assert.ok(f.voice.localLevel > 0);
  f.voice.startTalking(); f.voice.syncPeers(); assert.equal(f.timers.size, 1);
  f.voice.stopTalking(); assert.equal(f.timers.size, 0); assert.equal(f.voice.localLevel, 0);
  f.voice.setMuted(false); assert.equal(f.timers.size, 1);
  f.mic.tracks[0].mute(true); assert.equal(f.timers.size, 0);
  f.mic.tracks[0].mute(false); assert.equal(f.timers.size, 1);
  f.mic.tracks[0].end(); assert.equal(f.timers.size, 0); assert.equal(f.voice.inVoice, false);
  assert.equal(Context.all[0].disconnected, 1);
});

test('remote-only sampling follows peer mute, track replacement/ending and peer removal', t => {
  const f = fixture(t), peer = f.peer(), first = f.receive();
  assert.equal(f.voice.inVoice, false); assert.equal(f.timers.size, 1); assert.ok(f.voice.levelOf('remote') > 0);
  peer.muted = true; f.voice.syncPeers(); assert.equal(f.timers.size, 0); assert.equal(f.voice.levelOf('remote'), 0);
  peer.muted = false; f.voice.syncPeers(); assert.equal(f.timers.size, 1);
  first.mute(true); assert.equal(f.timers.size, 0); first.mute(false); assert.equal(f.timers.size, 1);
  const replacement = f.receive(); first.end(); assert.equal(f.timers.size, 1, 'old stream events cannot stop its replacement');
  replacement.end(); assert.equal(f.timers.size, 0); assert.equal(f.voice.levelOf('remote'), 0);
  f.receive(); assert.equal(f.timers.size, 1);
  store.peers.clear(); f.voice.syncPeers(); assert.equal(f.timers.size, 0); assert.equal(f.voice.conns.size, 0);
});

test('hidden or suspended contexts stop level work without stopping media and resume once', async t => {
  const f = fixture(t); await f.voice.joinVoice(); const ctx = Context.all[0];
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.timers.size, 0); assert.equal(f.voice.localLevel, 0); assert.equal(f.voice.inVoice, true); assert.equal(f.mic.tracks[0].readyState, 'live');
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange')); assert.equal(f.timers.size, 1);
  ctx.change('suspended'); assert.equal(f.timers.size, 0); ctx.change('running'); assert.equal(f.timers.size, 1);
  f.voice.reset(); assert.equal(f.timers.size, 1, 'reconnection retains the active local microphone');
  f.voice.leaveVoice(); const reads = ctx.reads;
  ctx.change('running'); f.document.dispatchEvent(new Event('visibilitychange')); f.tick();
  assert.equal(f.timers.size, 0); assert.equal(ctx.reads, reads);
});

test('remote audio keeps sampling when the local microphone leaves, and reset clears the last sampler', async t => {
  const f = fixture(t); f.peer(); f.receive(); await f.voice.joinVoice(); assert.equal(f.timers.size, 1);
  f.voice.leaveVoice(); f.tick(); assert.equal(f.timers.size, 1); assert.equal(f.voice.localLevel, 0); assert.ok(f.voice.levelOf('remote') > 0);
  f.voice.reset(); assert.equal(f.timers.size, 0); assert.equal(f.voice.levelOf('remote'), 0);
});
