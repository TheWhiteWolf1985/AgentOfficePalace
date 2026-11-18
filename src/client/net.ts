import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { remoteText } from '../shared/i18n';
import { lastFloor, store, type Profile, type Spot } from './state';
import { OrderedInbox } from './async-messages';

type Handler = (msg: ServerMsg) => void;

/** The sign-in page, coming back to the 2D view afterwards if that's where you are (see login.ts). */
export function loginUrl(): string {
  return location.pathname === '/lite' ? '/login?next=/lite' : '/login';
}

export class Net {
  private ws: WebSocket | null = null;
  private handlers: Handler[] = [];
  private statusHandlers: ((up: boolean) => void)[] = [];
  private retry = 0;
  private closedByUs = false;
  up = false;
  private initialFloor?: string;

  constructor(
    private profile: () => Profile,
    /** Where you are (or were, before this page), to be put back in the same spot. */
    private where: () => Spot | null,
    /** On the 2D view: in the office without standing anywhere in it (see PeerInfo.lite). */
    private lite = false,
    private prepare?: (message: ServerMsg) => Promise<void>,
  ) {
    const url = new URL(location.href);
    this.initialFloor = url.searchParams.get('floor') ?? undefined;
    if (this.initialFloor) { url.searchParams.delete('floor'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
  }

  onMessage(h: Handler) {
    this.handlers.push(h);
  }

  onStatus(h: (up: boolean) => void) {
    this.statusHandlers.push(h);
  }

  connect() {
    const { name, color, look } = this.profile();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ name, color, skin: String(look.skin), hair: String(look.hair), style: String(look.style) });
    if (look.colors) q.set('colors', JSON.stringify(look.colors));
    if (look.model) q.set('model', look.model);
    if (look.hairstyle) q.set('hairstyle', look.hairstyle);
    // Back to the floor you were on (after a reload or a restart), in the spot you were in there.
    const floor = store.floor ?? this.initialFloor ?? lastFloor();
    if (floor) q.set('floor', floor);
    if (this.lite) q.set('lite', '1');
    const at = this.where();
    if (floor && at?.floor === floor) {
      for (const k of ['x', 'y', 'z'] as const) q.set(k, at[k].toFixed(2));
      q.set('rotY', at.facing.toFixed(3));
    }
    const ws = new WebSocket(`${proto}://${location.host}/ws?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.up = true;
      this.statusHandlers.forEach((h) => h(true));
    };
    const inbox = new OrderedInbox<ServerMsg>(message => this.prepare?.(message), message => {
      for (const h of this.handlers) h(message);
    }, () => this.ws === ws && ws.readyState === WebSocket.OPEN, () => ws.close(1011, 'Could not prepare the room'));
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'toast') msg.text = remoteText(msg.text);
      const error = msg as unknown as { error?: unknown };
      if (typeof error.error === 'string') error.error = remoteText(error.error);
      void inbox.push(msg);
    };
    ws.onclose = async () => {
      if (this.ws !== ws) return;
      this.up = false;
      this.statusHandlers.forEach((h) => h(false));
      if (this.closedByUs) return;
      // Session expired? Go back to the door.
      try {
        const res = await fetch('/api/whoami', { cache: 'no-store' });
        if (res.status === 401) {
          location.href = loginUrl();
          return;
        }
      } catch {
        // offline; keep retrying
      }
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
