import type { BinaryFileData } from '@excalidraw/excalidraw/types';

interface FileElement { type: string; isDeleted?: boolean; fileId?: string | null }

/** One visit to one board. Disposing it also invalidates a later A → B → A return. */
export class WhiteboardScope {
  private alive = true;
  readonly files: WhiteboardFiles;
  constructor(readonly board: string, private current: () => string | null, warn: (text?: string) => void) {
    this.files = new WhiteboardFiles(this, warn);
  }
  active() { return this.alive && this.current() === this.board; }
  dispose() { this.alive = false; }
}

/** Pictures and upload acknowledgements belong to a board, including while a request is in flight. */
export class WhiteboardFiles {
  private files = new Map<string, BinaryFileData>();
  private stored = new Set<string>();
  private uploads = new Map<string, Promise<boolean>>();
  private missing = new Map<string, number>();
  constructor(private scope: Pick<WhiteboardScope, 'board' | 'active'>, private warn: (text?: string) => void, private request: typeof fetch = (...args) => globalThis.fetch(...args)) {}
  url(id?: string) { return `/api/whiteboard/file?floor=${encodeURIComponent(this.scope.board)}${id ? `&id=${encodeURIComponent(id)}` : ''}`; }
  has(id: string) { return this.stored.has(id); }
  snapshot() { return Object.fromEntries(this.files); }
  async load(els: readonly FileElement[]): Promise<BinaryFileData[]> {
    if (!this.scope.active()) return [];
    const want = new Set<string>();
    const now = Date.now();
    for (const el of els) {
      const id = el.type === 'image' && !el.isDeleted ? el.fileId : null;
      if (id && !this.files.has(id) && now - (this.missing.get(id) ?? 0) > 10_000) want.add(id);
    }
    const got: BinaryFileData[] = [];
    await Promise.all([...want].map(async (id) => {
      try {
        const res = await this.request(this.url(id));
        if (!res.ok) throw new Error(String(res.status));
        const f = await res.json() as BinaryFileData;
        if (!this.scope.active()) return;
        this.files.set(id, f); this.stored.add(id); this.missing.delete(id); got.push(f);
      } catch { if (this.scope.active()) this.missing.set(id, Date.now()); }
    }));
    return got;
  }
  upload(f: BinaryFileData): Promise<boolean> {
    if (!this.scope.active()) return Promise.resolve(false);
    const pending = this.uploads.get(f.id);
    if (pending) return pending;
    const p = this.request(this.url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: f.id, mimeType: f.mimeType, dataURL: f.dataURL, created: f.created }) })
      .then(async (res) => {
        if (!this.scope.active()) return false;
        if (res.ok) { this.stored.add(f.id); this.files.set(f.id, f); return true; }
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        this.warn(error); return false;
      }).catch(() => false).then((ok) => { this.uploads.delete(f.id); return ok; });
    this.uploads.set(f.id, p);
    return p;
  }
}
