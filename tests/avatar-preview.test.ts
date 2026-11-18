import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarPreviewPolicy, PreviewLoop } from '../src/client/ui/preview-loop.js';

function fixture(fps = 30) {
  let seq = 0; const callbacks = new Map<number, FrameRequestCallback>(), drawn: {dt: number;now: number}[] = [];
  const loop = new PreviewLoop((dt,now) => drawn.push({dt,now}), fps, fn => { callbacks.set(++seq,fn); return seq; }, id => { callbacks.delete(id); });
  return {loop,drawn,callbacks,tick(now: number) { const frame = [...callbacks.values()]; callbacks.clear(); frame.forEach(fn => fn(now)); }};
}

test('user preview follows quality, caps high refresh/unlimited and lowers pixel/shadow budgets', () => {
  assert.deepEqual(avatarPreviewPolicy({quality:'high',fps:0}, 3), {pixelRatio:1.5,shadows:true,shadowSize:1024,outline:true,fps:30});
  assert.deepEqual(avatarPreviewPolicy({quality:'balanced',fps:60}, 2), {pixelRatio:1.25,shadows:true,shadowSize:512,outline:true,fps:30});
  assert.deepEqual(avatarPreviewPolicy({quality:'economy',fps:30}, 2), {pixelRatio:1,shadows:false,shadowSize:512,outline:false,fps:20});
  assert.equal(avatarPreviewPolicy({quality:'high',fps:30}, .5).pixelRatio,.5);
});

test('preview draws at its configured cadence while continuous input retains a single RAF', () => {
  const f = fixture(); f.loop.setVisible(true);
  for (let i = 0; i < 720; i++) { for (let k = 0; k < 5; k++) f.loop.invalidate(); assert.equal(f.callbacks.size,1); f.tick(1000+i*1000/144); }
  assert.ok(Math.abs(f.drawn.length-150)<=1, String(f.drawn.length));
  assert.ok(f.drawn.slice(1).every(f => f.dt <= .1 && f.dt > 0));
  f.loop.setRate(20); const count = f.drawn.length;
  for (let i=0;i<144;i++)f.tick(7000+i*1000/144);
  assert.ok(Math.abs(f.drawn.length-count-20)<=1);
});

test('covered/offscreen/hidden preview cancels callbacks and resumes with current state and zero catch-up', () => {
  const f = fixture(); f.loop.invalidate(); assert.equal(f.callbacks.size,0);
  for (let i=0;i<3;i++) {
    f.loop.setVisible(true); f.tick(1000+i*10000);
    assert.equal(f.drawn.at(-1)?.dt,0);
    f.loop.setVisible(false); for(let k=0;k<50;k++)f.loop.invalidate();
    assert.equal(f.callbacks.size,0);
  }
  f.loop.setVisible(true); f.tick(100000); assert.equal(f.drawn.at(-1)?.dt,0);
});

test('disposing preview cancels pending work permanently, including a late browser callback', () => {
  const f=fixture(); f.loop.setVisible(true); const pending=[...f.callbacks.values()][0];
  f.loop.dispose(); assert.equal(f.callbacks.size,0); pending(1000);
  f.loop.setVisible(true); f.loop.setRate(60); f.loop.invalidate();
  assert.deepEqual(f.drawn,[]); assert.equal(f.callbacks.size,0);
});
