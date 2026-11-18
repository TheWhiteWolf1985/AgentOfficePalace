import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredShare, ShareThumbnails, showVideo, type ScreenShare } from '../src/client/features/voice/shares.js';

class Element {
  children: Element[] = [];
  parent: Element | null = null;
  srcObject: unknown = null;
  textContent = '';
  plays = 0;
  pauses = 0;
  onclick?: () => void;
  append(...children: Element[]) { children.forEach(child => this.insertBefore(child, null)); }
  insertBefore(child: Element, before: Element | null) {
    child.remove(); child.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }
  remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
  play() { this.plays++; return Promise.resolve(); }
  pause() { this.pauses++; }
}
const share = (id: string, name: string, local = false): ScreenShare => ({ id, name, local, stream: {} as MediaStream });

test('remote identity wins in Italian/English even with duplicate names or a participant named You', () => {
  for (const label of ['You', 'Tu']) {
    const local = share('me', label, true), a = share('a', 'You'), b = share('b', label);
    assert.equal(preferredShare([local, a, b]), a);
    assert.equal(preferredShare([local]), local);
  }
  assert.equal(preferredShare([]), undefined);
});

test('thumbnails retain their video across peer updates, names and order; removed consumers release media', t => {
  let created = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { created++; return new Element(); } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); });
  const box = new Element(), watched: string[] = [];
  const thumbnails = new ShareThumbnails(box as unknown as HTMLElement, id => watched.push(id), () => 'Watch');
  const a = share('a', 'Same'), b = share('b', 'Same'), local = share('me', 'Tu', true);
  thumbnails.sync([local, a, b]);
  assert.equal(created, 6, 'local screen has no thumbnail');
  const [first, second] = box.children, video = first.children[0];
  for (let i = 0; i < 100; i++) thumbnails.sync([local, a, b]);
  assert.equal(created, 6); assert.equal(video.plays, 1); assert.equal(box.children[0], first);
  a.name = 'You'; thumbnails.sync([b, a]);
  assert.deepEqual(box.children, [second, first]);
  assert.equal(first.children[1].textContent, '🖥️ You');
  first.onclick!(); second.onclick!(); assert.deepEqual(watched, ['a', 'b']);
  const replacement = {} as MediaStream;
  thumbnails.sync([{ ...a, stream: replacement }, b]);
  assert.equal(box.children[0], first); assert.equal(video.srcObject, replacement); assert.equal(video.plays, 2);
  thumbnails.sync([b]);
  assert.equal(video.srcObject, null); assert.equal(first.parent, null);
  assert.equal(second.children[0].srcObject, b.stream);
  thumbnails.sync([]);
  assert.equal(box.children.length, 0); assert.equal(second.children[0].srcObject, null);
  thumbnails.sync([a]); assert.equal(created, 9, 'a new sharing visit creates one new consumer');
});

test('video stream changes are idempotent and releasing a consumer does not stop source tracks', () => {
  const video = new Element(); let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream;
  const element = video as unknown as HTMLVideoElement;
  showVideo(element, stream); showVideo(element, stream);
  assert.equal(video.plays, 1);
  showVideo(element, null); showVideo(element, null);
  assert.equal(video.pauses, 2); assert.equal(video.srcObject, null); assert.equal(stopped, 0);
});
