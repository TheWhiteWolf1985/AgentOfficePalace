/** Prepare world resources in wire order; a closed/replaced connection may never publish a late result. */
export class OrderedInbox<T> {
  private pending = Promise.resolve();
  constructor(private prepare: (value: T) => void | Promise<void>, private publish: (value: T) => void, private active: () => boolean, private failed: (error: unknown) => void) {}
  push(value: T): Promise<void> {
    return this.pending = this.pending.then(async () => {
      if (!this.active()) return;
      await this.prepare(value);
      if (this.active()) this.publish(value);
    }).catch(error => { if (this.active()) this.failed(error); });
  }
}
