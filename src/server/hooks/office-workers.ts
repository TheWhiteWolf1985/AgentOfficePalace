import type http from 'node:http';
import { notLeaving } from '../leave-on-merge.js';
import { findWorker, readHireRequest, readHomeRequest, readPrRequest, workerRow, type PullsView } from '../office-workers.js';
import { gh } from '../github.js';
import type { Floor } from '../floor.js';
import { nextFreeSeat } from '../../shared/layout.js';
import type { WorkerInfo } from '../../shared/protocol.js';
import type { Ctx } from '../office/context.js';
import { str } from '../office/input.js';
import { readBody, send } from '../http/util.js';

/**
 * Pull request `n` on a floor, for a worker to have as its own: one that's open, or merged and still
 * on the floor's list. A string says why it can't be.
 */
async function pullOf(floor: Floor, n: number, repo?: string): Promise<{ number: number; url: string } | string> {
  const here = floor.def.repo;
  if (repo && here && repo.toLowerCase() !== here.toLowerCase()) return `That pull request is in ${repo}, and this floor is ${here}`;
  const listed = floor.github.pulls.items.find((p) => p.number === n);
  let pr: { url: string; state: string } | undefined = listed;
  if (!pr) {
    try {
      pr = JSON.parse(await gh(['pr', 'view', String(n), '--json', 'url,state'], floor.dir)) as { url: string; state: string };
    } catch (err) {
      return `No pull request #${n} here: ${(err as Error).message}`;
    }
  }
  if (pr.state === 'CLOSED') return `PR #${n} was closed without merging`;
  // The office follows the open ones and the last ones merged: an older one would look open for good.
  if (!listed && pr.state === 'MERGED') return `PR #${n} merged too long ago for the office to follow: send the worker home by name instead`;
  return { number: n, url: pr.url };
}

/**
 * The floor's workers, for any worker on it (see office-workers.ts, and bin/office-workers.js, the
 * command and MCP server that call it): GET lists them, POST hires one, POST /home sends some home
 * (its worktree and branch go too, unless they hold work), POST /tell types a prompt to one, POST /pr
 * says which pull request is one's (for one the office couldn't tell by itself). The
 * worker's own hook token says who's asking, and the floor hears who did what, as from anyone.
 */
export async function officeWorkers(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL, socket = false) {
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const me = floor?.workers.authenticate(workerId, token);
  if (!floor || !me) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  if (socket && me.runtime !== 'docker') return send(res, 403, { error: 'Container identity required' });
  const restricted = me.runtime === 'docker';
  const peers = () => floor.workers.list().filter(w => !restricted || (w.runtime === 'docker' && w.kind === 'agent' && floor.workers.ownerOf(w.id) === floor.workers.ownerOf(me.id)));
  const who = me.name;
  const view: PullsView = { pulls: floor.github.pulls.items, tasks: floor.queue.state().tasks, pullsOf: (id) => ctx.floors.get(id)?.github.pulls.items };
  const row = (id: string) => {
    const w = floor.workers.get(id);
    return w && workerRow(w, view, me.id);
  };
  const action = url.pathname.slice('/office/workers'.length);
  if (req.method === 'GET' && !action) {
    const list = peers();
    const free = nextFreeSeat((id) => floor.workers.deskOccupied(id), floor.plan.wing);
    return send(res, 200, {
      floor: { id: floor.id, name: floor.def.name, repo: floor.def.repo, branch: floor.project.branch },
      you: me.id,
      leaveOnMerge: ctx.leaveOnMerge.on,
      providers: floor.project.agentProviders,
      defaultProvider: floor.workers.officeDefault.provider,
      freeDesk: free?.id ?? null,
      ...(ctx.ledger.hiringPaused ? { hiringPaused: ctx.ledger.hiringPaused } : {}),
      workers: list.map((w) => workerRow(w, view, me.id)),
    });
  }
  const peerAction = action === '/result' || action === '/reply';
  if (peerAction && !restricted) return send(res, 403, { error: 'Container identity required' });
  if (restricted && action !== '/tell' && !peerAction) return send(res, 403, { error: 'Only peer messaging is available' });
  if (req.method !== 'POST' || (!peerAction && !['', '/home', '/tell', '/pr'].includes(action))) return send(res, 405, { error: 'Unsupported office worker operation' });
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return send(res, 400, { error: 'Send JSON' });
  }

  if (peerAction) {
    const b = (body ?? {}) as { requestId?: unknown; reply?: unknown };
    const id = str(b.requestId, 64);
    const owner = floor.workers.ownerOf(me.id);
    if (action === '/reply') {
      if (typeof b.reply !== 'string' || b.reply.length > 20_000) return send(res, 400, { error: 'Expected a reply of up to 20000 characters' });
      return floor.peerRequests.answer(id, me.id, owner, b.reply.trim())
        ? send(res, 200, { ok: true }) : send(res, 404, { error: 'No matching open request' });
    }
    const r = floor.peerRequests.result(id, me.id, owner, wid => {
      const w = floor.workers.get(wid);
      return w?.status === 'done' ? w.waitingSince : undefined;
    });
    if (!r) return send(res, 404, { error: 'Unknown or expired request' });
    const peer = peers().find(w => w.id === r.workerId);
    if (!peer || (r.status === 'pending' && (peer.paused || peer.status === 'offline' || peer.status === 'exited'))) {
      return send(res, 409, { error: 'The recipient is unavailable' });
    }
    return send(res, 200, r);
  }

  if (action === '/home') {
    const ask = readHomeRequest(body);
    if (typeof ask === 'string') return send(res, 400, { error: ask });
    type Outcome = { worker: string; id?: string; went?: boolean; note?: string; error?: string; skipped?: string };
    const results: Outcome[] = [];
    const going: { w: WorkerInfo; why?: string }[] = [];
    if (ask.merged) {
      for (const w of floor.workers.list()) {
        const landed = floor.landed(w);
        if (!landed) continue;
        const why = landed.prs?.length ? `its pull requests merged (${landed.prs.join(', ')})` : `PR #${landed.pr} merged`;
        const staying = w.id === me.id ? "that's you" : notLeaving(w);
        if (staying) results.push({ worker: w.name, id: w.id, skipped: `${why}, but it's ${staying}` });
        else going.push({ w, why });
      }
    } else {
      for (const key of ask.workers) {
        const w = findWorker(floor.workers.list(), key);
        if (typeof w === 'string') results.push({ worker: key, error: w });
        else if (w.id === me.id) results.push({ worker: w.name, id: w.id, error: "That's you: someone else has to send you home" });
        else if (!going.some((g) => g.w === w)) going.push({ w });
      }
    }
    // One at a time: git takes a lock on the repository's refs to delete a branch.
    for (const { w, why } of going) {
      if (!restricted && w.runtime === 'docker' && (!floor.workers.ownerOf(me.id) || floor.workers.ownerOf(me.id) !== floor.workers.ownerOf(w.id))) {
        results.push({ worker: w.name, id: w.id, error: 'Different worker owner' }); continue;
      }
      if (floor.workers.get(w.id) !== w) {
        results.push({ worker: w.name, id: w.id, skipped: 'it had already gone' });
        continue;
      }
      ctx.toastFloor(floor, why ? `🏠 ${who} sent ${w.name} home: ${why}` : `${who} sent ${w.name} home`);
      const { note, error } = await floor.sendHome(w.id, ask.cleanup);
      if (note) ctx.toastFloor(floor, note);
      if (error) ctx.toastFloor(floor, error, 'warn');
      results.push({ worker: w.name, id: w.id, went: true, ...(note ? { note } : {}), ...(error ? { error } : {}) });
    }
    return send(res, 200, { results });
  }

  if (action === '/tell') {
    const b = (body ?? {}) as { worker?: unknown; prompt?: unknown; expectReply?: unknown };
    const w = findWorker(peers(), str(b.worker, 64));
    if (typeof w === 'string') return send(res, 404, { error: w });
    if (w.id === me.id) return send(res, 400, { error: "That's you" });
    if (!restricted && w.runtime === 'docker' && (!floor.workers.ownerOf(me.id) || floor.workers.ownerOf(me.id) !== floor.workers.ownerOf(w.id))) return send(res, 403, { error: 'Different worker owner' });
    // A shell would run it as a command, in someone's terminal.
    if (w.kind !== 'agent') return send(res, 400, { error: `${w.name} is a shell, not an agent` });
    const text = str(b.prompt, 20000).replace(/\r\n?/g, '\n').trim();
    if (!text) return send(res, 400, { error: 'Say what to tell it: prompt' });
    if (restricted) {
      const owner = floor.workers.ownerOf(me.id);
      let requestId: string | undefined;
      if (b.expectReply === true) {
        const prefix = (id: string) => '[Office request ' + id + '] From ' + who + '. Answer normally in your final message, including any reason you cannot complete the task. The office returns it to the sender automatically.\n\n';
        if (prefix('x'.repeat(36)).length + text.length > 20_000) return send(res, 400, { error: 'Delegation prompt too long' });
        requestId = floor.peerRequests.start(me.id, w.id, owner, id => floor.workers.assignTask(w.id, prefix(id) + text, who, owner));
      }
      const delivered = b.expectReply === true ? !!requestId : floor.workers.assignTask(w.id, text, who, owner);
      if (!delivered) return send(res, 409, { error: w.name + ' is unavailable. Check list_workers before retrying.' });
      ctx.toastFloor(floor, who + ' → ' + w.name);
      return send(res, 200, { ok: true, delivered: true, requestId, worker: row(w.id) });
    }
    let err = floor.workers.prompt(w.id, text, who);
    // Stopped or asleep: it wakes up with this as its next message.
    if (err === 'Worker is not running') err = floor.workers.resume(w.id, text);
    if (err) return send(res, 400, { error: err });
    return send(res, 200, { ok: true, worker: row(w.id) });
  }

  if (action === '/pr') {
    const ask = readPrRequest(body);
    if (typeof ask === 'string') return send(res, 400, { error: ask });
    const w = ask.worker ? findWorker(floor.workers.list(), ask.worker) : me;
    if (typeof w === 'string') return send(res, 404, { error: w });
    if (w.kind !== 'agent') return send(res, 400, { error: `${w.name} is a shell, not an agent` });
    const pr = ask.pr === undefined ? undefined : await pullOf(floor, ask.pr, ask.repo);
    if (typeof pr === 'string') return send(res, 400, { error: pr });
    const err = floor.workers.linkPr(w.id, pr);
    if (err) return send(res, 404, { error: err });
    const whose = w.id === me.id ? 'its own' : `${w.name}'s`;
    ctx.toastFloor(floor, pr ? `${who} said PR #${pr.number} is ${whose}` : `${who} said ${w.id === me.id ? 'it has' : `${w.name} has`} no pull request`);
    return send(res, 200, { ok: true, worker: row(w.id) });
  }

  const ask = readHireRequest(body, floor.project.agentProviders);
  if (typeof ask === 'string') return send(res, 400, { error: ask });
  const desk = ask.desk ?? nextFreeSeat((id) => floor.workers.deskOccupied(id), floor.plan.wing)?.id;
  if (!desk) return send(res, 409, { error: 'Every desk and bean bag is taken: send someone home first' });
  // A model or effort is the office's default worker's unless it says whose.
  const provider = ask.provider ?? (ask.model || ask.effort ? floor.workers.officeDefault.provider : undefined);
  const worktree = ask.worktree ?? !!floor.project.branch;
  // Its worktree starts from what's on GitHub now, like one hired from a desk.
  if (worktree) await floor.workers.fetchBase();
  if (!ctx.floors.has(floor.id)) return send(res, 410, { error: 'This floor closed' });
  // It runs as whoever the asking worker runs as.
  const owner = floor.workers.ownerOf(me.id);
  const r = floor.workers.spawn(desk, who, ask.prompt, worktree, 'agent', provider, ask.model, ask.effort, undefined, owner);
  if (typeof r === 'string') return send(res, 400, { error: r });
  ctx.toastFloor(floor, `${who} hired ${r.name}${ask.issue ? ` for issue #${ask.issue}` : ' with a task'}`);
  if (ask.issue) {
    const n = ask.issue;
    floor.queue.dropIssue(n);
    const as = owner ? ctx.signins.ghAs(owner) : undefined;
    if (typeof as === 'string') ctx.toastFloor(floor, `Couldn't assign issue #${n} on GitHub: ${as}`, 'warn');
    else void floor.github.claim(n, as).then((e) => e && ctx.toastFloor(floor, `Couldn't assign issue #${n} on GitHub: ${e}`, 'warn'));
  }
  send(res, 200, { ok: true, worker: row(r.id) });
}
