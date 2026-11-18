/** Coalesces changes while covered, and invalidates async work before it can paint a later visit. */
export class PreviewScheduler {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private dirty = true;

  constructor(private visible: () => boolean, private draw: (current: () => boolean) => Promise<void>, private delay = 300) {}

  invalidate() {
    this.generation++;
    this.dirty = true;
    if (!this.visible()) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.schedule();
  }

  private schedule() {
    if (this.timer !== undefined || this.busy || !this.dirty || !this.visible()) return;
    this.timer = setTimeout(() => void this.run(), this.delay);
  }

  private async run() {
    this.timer = undefined;
    if (!this.visible()) return;
    const generation = this.generation;
    this.dirty = false;
    this.busy = true;
    try {
      await this.draw(() => generation === this.generation && this.visible());
    } catch {
      // Keep the previous picture. A later change/visibility event retries, without a retry loop.
    } finally {
      this.busy = false;
      this.schedule();
    }
  }
}
