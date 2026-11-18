import { t as uiText } from '../../../shared/i18n';
/**
 * Voice and screen sharing: V to join voice (then push to talk), M to mute, sharing your screen, the
 * shared screens' thumbnails, watching one full screen, and which of them is up on the office TV.
 */
import type { Ctx } from '../../core/context';
import { store } from '../../state';
import { $, h, openModal, setDoing, toast, type Modal } from '../../ui/dom';
import { preferredShare, ShareThumbnails, showVideo, type ScreenShare } from './shares';

export interface VoiceDeps {
  /** The office TV, which shows a screen someone's sharing (see features/tv). */
  tv: { show(stream: MediaStream | null): void };
}

/** Registers V and M, voice's messages, and listens for V coming up (captured) and the window losing focus. */
export function installVoice(ctx: Ctx, deps: VoiceDeps) {
  const { voice } = ctx;

  async function toggleVoice() {
    if (voice.inVoice) voice.leaveVoice();
    else await joinVoice();
  }

  async function joinVoice() {
    if (!window.isSecureContext) { const url = secureMediaUrl(); if (url) location.assign(url); return; }
    const err = await voice.joinVoice(ctx.settings.pushToTalk);
    if (err) toast(err, 'warn');
    else if (ctx.settings.pushToTalk && voice.inVoice) toast(uiText('🎙️ In voice, muted: hold V to talk'));
  }
  ctx.keys.bind({
    code: 'KeyV',
    // Joins voice; in it, it's push to talk (let go and you're muted, see the keyup below).
    repeat: false,
    run: () => {
      if (voice.inVoice) voice.startTalking();
      else void joinVoice();
    },
  });
  // Letting go of V mutes you again, wherever the key comes up: a window or a terminal opened meanwhile,
  // or another app (the browser never says the key came up there).
  window.addEventListener('keyup', (e) => e.code === 'KeyV' && voice.stopTalking(), true);
  window.addEventListener('blur', () => voice.stopTalking());
  ctx.keys.bind({
    code: 'KeyM',
    run: () => {
      voice.toggleMute();
    },
  });

  async function toggleShare() {
    if (!window.isSecureContext) { const url = secureMediaUrl(); if (url) location.assign(url); return; }
    if (voice.sharing) voice.stopShare();
    else {
      const err = await voice.startShare();
      if (err) toast(err, 'warn');
    }
  }

  function currentShares(): ScreenShare[] {
    const out: ScreenShare[] = [];
    const local = voice.localScreen;
    if (local) out.push({ id: store.you, name: uiText('You'), stream: local, local: true });
    for (const [id, s] of voice.remoteScreens()) {
      const peer = store.peers.get(id);
      // A screen shared on another floor is on that floor's TV.
      if (!peer || !store.onMyFloor(peer)) continue;
      out.push({ id, name: peer.name, stream: s, local: false });
    }
    return out;
  }

  const thumbnails = new ShareThumbnails($('shares'), id => watchShare(id), () => uiText('Watch full screen'));
  let viewer: { id: string; video: HTMLVideoElement; title: HTMLElement; modal: Modal } | undefined;
  let refreshQueued = false;
  function refreshShares() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => { refreshQueued = false; syncShares(); });
  }

  function syncShares() {
    const shares = currentShares();
    // Remote shares win the TV; your own share is what others see anyway.
    deps.tv.show(preferredShare(shares)?.stream ?? null);
    thumbnails.sync(shares);
    if (viewer) {
      const share = shares.find(s => s.id === viewer!.id);
      if (!share) viewer.modal.close();
      else updateViewer(share);
    }
    ctx.hint.invalidate();
  }

  /** Someone's shared screen, full screen: someone else's before your own. With nobody sharing, you share yours. */
  function watchShare(id?: string) {
    const streams = currentShares();
    const share = id ? streams.find(s => s.id === id) : preferredShare(streams);
    if (!share) {
      if (id) return;
      void toggleShare();
      return;
    }
    if (viewer) { viewer.id = share.id; updateViewer(share); return; }
    const video = h('video', { autoplay: true, playsinline: true, muted: true }) as HTMLVideoElement;
    const title = h('h2');
    const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
    const el = h('div.modal.viewer', { role: 'dialog', 'aria-label': uiText('Screen share') }, h('header', {}, title, close), video);
    const modal = openModal(el, { onClose: () => { showVideo(video, null); viewer = undefined; } });
    viewer = { id: share.id, video, title, modal };
    updateViewer(share);
    close.addEventListener('click', () => modal.close());
  }

  function updateViewer(share: ScreenShare) {
    if (!viewer) return;
    showVideo(viewer.video, share.stream);
    viewer.title.textContent = uiText`🖥️ ${share.name}'s screen`;
    setDoing(viewer.modal, uiText`🖥️ watching ${share.name}'s screen`);
  }

  voice.onChange(() => {
    ctx.hud.refresh();
    refreshShares();
  });
  // Said once a session per person: retrying (restartIce) fails the same way on the same networks.
  const unreachable = new Set<string>();
  voice.onFailed((id) => {
    if (unreachable.has(id)) return;
    unreachable.add(id);
    const who = store.peers.get(id)?.name ?? 'someone';
    toast(uiText`🎙️ Can't connect voice with ${who}: a network between you blocks direct calls. The office needs a TURN server (see self-hosting docs).`, 'warn');
  });
  ctx.messages.on('peer.join', () => voice.syncPeers());
  ctx.messages.on('peer.leave', () => voice.syncPeers());
  store.on('floor', () => { voice.syncScreenSenders(); refreshShares(); });
  store.on('peers', () => { voice.syncScreenSenders(); voice.syncLevelSampling(); refreshShares(); });
  ctx.messages.on('rtc', (msg) => void voice.handleSignal(msg.from, msg.data as never));

  return { toggleVoice, toggleShare, currentShares, refreshShares, watchShare };
}
import { secureMediaUrl } from '../../secure-media';
