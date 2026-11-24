import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Ticket = {
  id: string; from: string; to: string; owner?: string; created: number;
  session?: string; turn?: string; reply?: string; error?: string;
};

const lifetime = 24 * 60 * 60 * 1000;
const pending = (r: Ticket) => r.reply === undefined && r.error === undefined;

/** Private to one floor. Results survive a server restart and are read only by the caller. */
export class PeerRequests {
  private readonly file: string;
  private rows: Ticket[];

  constructor(dir: string) {
    this.file = path.join(dir, 'peer-requests.json');
    this.rows = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : [];
  }

  private save() {
    writeFileSync(this.file + '.tmp', JSON.stringify(this.rows), { mode: 0o600 });
    renameSync(this.file + '.tmp', this.file);
  }

  start(from: string, to: string, owner: string | undefined, deliver: (id: string) => boolean) {
    this.rows = this.rows.filter(r => Date.now() - r.created < lifetime);
    if (this.rows.length >= 1024) {
      const old = this.rows.findIndex(r => !pending(r));
      if (old < 0) throw Error('Too many outstanding requests on this floor');
      this.rows.splice(old, 1);
    }
    const r: Ticket = { id: randomUUID(), from, to, owner, created: Date.now() };
    this.rows.push(r);
    this.save();
    let accepted = false;
    try {
      accepted = deliver(r.id);
      return accepted ? r.id : undefined;
    } finally {
      if (!accepted) { this.rows.pop(); this.save(); }
    }
  }

  result(id: string, from: string, owner?: string, endedAt?: (workerId: string) => number | undefined) {
    const r = this.rows.find(r => r.id === id && r.from === from && r.owner === owner && Date.now() - r.created < lifetime);
    if (!r) return;
    const end = endedAt?.(r.to);
    // Give the Stop hook time to deliver its correlated final message over the socket.
    if (pending(r) && end !== undefined && end >= r.created && Date.now() - end > 10_000) {
      r.error = 'The colleague finished the turn, but no reply was delivered for this request.';
      this.save();
    }
    return { requestId: id, workerId: r.to, status: r.error !== undefined ? 'failed' : r.reply !== undefined ? 'answered' : 'pending', reply: r.reply, error: r.error };
  }

  answer(id: string, to: string, owner: string | undefined, text: string) {
    const r = this.rows.find(r => r.id === id && r.to === to && r.owner === owner && Date.now() - r.created < lifetime);
    if (!r || !pending(r)) return r?.reply !== undefined && r.reply === text;
    if (text) r.reply = text;
    else r.error = 'The delegated turn ended without a final message.';
    this.save();
    return true;
  }

  /** Only the exact root turn that accepted our marked prompt may return its final text automatically. */
  hook(to: string, owner: string | undefined, event: string, report: { session_id?: unknown; turn_id?: unknown; prompt?: unknown }) {
    const { session_id: session, turn_id: turn, prompt } = report;
    if (typeof session !== 'string' || typeof turn !== 'string' || !session || !turn) return;
    const requests = this.rows.filter(r => r.to === to && r.owner === owner && pending(r) && Date.now() - r.created < lifetime);
    if (event === 'UserPromptSubmit' && typeof prompt === 'string') {
      const r = requests.find(r => !r.session && prompt.startsWith('[Office request ' + r.id + ']'));
      const superseded = requests.filter(old => old.session === session && old.turn !== turn);
      for (const old of superseded) old.error = 'Another turn started before the colleague returned an answer.';
      if (r) { r.session = session; r.turn = turn; }
      if (r || superseded.length) this.save();
      return;
    }
    const r = requests.find(r => r.session === session && r.turn === turn);
    if (!r) return;
    if (event === 'Stop') return r.id;
    if (event === 'Interrupt') { r.error = 'The delegated turn was interrupted.'; this.save(); }
  }
}
