/** Identity is independent of display names and the translated local label. */
export interface ScreenShare {
  id: string;
  name: string;
  stream: MediaStream;
  local: boolean;
}

export const preferredShare = (shares: readonly ScreenShare[]) => shares.find(s => !s.local) ?? shares[0];

/** Releasing a consumer must never stop the shared incoming tracks. */
export function showVideo(video: HTMLVideoElement, stream: MediaStream | null) {
  if (video.srcObject === stream) return;
  video.pause();
  video.srcObject = stream;
  if (stream) void video.play().catch(() => {});
}

/** One thumbnail and video per remote participant, across ordinary peer updates. */
export class ShareThumbnails {
  private entries = new Map<string, { el: HTMLDivElement; video: HTMLVideoElement; label: HTMLSpanElement }>();

  constructor(private box: HTMLElement, private watch: (id: string) => void, private title: () => string) {}

  sync(shares: readonly ScreenShare[]) {
    const remote = shares.filter(s => !s.local);
    const ids = new Set(remote.map(s => s.id));
    for (const [id, entry] of this.entries) {
      if (ids.has(id)) continue;
      showVideo(entry.video, null);
      entry.el.remove();
      this.entries.delete(id);
    }
    remote.forEach((share, i) => {
      let entry = this.entries.get(share.id);
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'share-thumb';
        const video = document.createElement('video');
        video.autoplay = true; video.playsInline = true; video.muted = true;
        const label = document.createElement('span');
        label.className = 'who';
        el.append(video, label);
        el.onclick = () => this.watch(share.id);
        entry = { el, video, label };
        this.entries.set(share.id, entry);
      }
      const label = `🖥️ ${share.name}`;
      if (entry.label.textContent !== label) entry.label.textContent = label;
      entry.el.title = this.title();
      showVideo(entry.video, share.stream);
      if (this.box.children[i] !== entry.el) this.box.insertBefore(entry.el, this.box.children[i] ?? null);
    });
  }
}
