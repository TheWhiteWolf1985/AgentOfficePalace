import { graphicsPolicy, RenderCadence, type GraphicsSettings } from '../graphics-settings';

export function avatarPreviewPolicy(settings: GraphicsSettings, dpr: number) {
  const policy = graphicsPolicy(settings, dpr);
  return {
    ...policy,
    fps: Math.min(settings.fps || 30, settings.quality === 'economy' ? 20 : 30),
    pixelRatio: Math.min(policy.pixelRatio, settings.quality === 'high' ? 1.5 : settings.quality === 'balanced' ? 1.25 : 1),
    shadowSize: settings.quality === 'high' ? 1024 : 512,
  };
}

/** One cancellable RAF, with no callbacks while covered and no catch-up animation after a pause. */
export class PreviewLoop {
  private cadence = new RenderCadence();
  private frame: number | undefined;
  private last: number | undefined;
  private visible = false;
  private disposed = false;

  constructor(
    private draw: (dt: number, now: number) => void,
    private fps: number,
    private request = (fn: FrameRequestCallback) => requestAnimationFrame(fn),
    private cancel = (id: number) => cancelAnimationFrame(id),
  ) {}

  setRate(fps: number) { this.fps = fps; this.cadence.reset(); this.invalidate(); }
  setVisible(visible: boolean) {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible; this.last = undefined; this.cadence.reset();
    if (!visible && this.frame !== undefined) { this.cancel(this.frame); this.frame = undefined; }
    this.invalidate();
  }
  invalidate() {
    if (this.disposed || !this.visible || this.frame !== undefined) return;
    this.frame = this.request(now => {
      this.frame = undefined;
      if (this.disposed || !this.visible) return;
      if (this.cadence.due(now, this.fps)) {
        const dt = this.last === undefined ? 0 : Math.min(.1, (now - this.last) / 1000);
        this.last = now; this.draw(dt, now);
      }
      this.invalidate();
    });
  }
  dispose() {
    this.disposed = true;
    if (this.frame !== undefined) this.cancel(this.frame);
    this.frame = undefined;
  }
}
