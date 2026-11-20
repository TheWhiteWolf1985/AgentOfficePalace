import { officeLoaded } from '../../world/deferred-office';
import { t as uiText } from '../../../shared/i18n';

import * as THREE from 'three';
import { FLOOR, WING, beanbagsOut, deskBuilt, vacantSeats, wingMinZ, wingRowZ } from '../../../shared/layout';
import { MEETING_PATTERNS } from '../../../shared/meetings';
import type { WorkerInfo, WorkerTask } from '../../../shared/protocol';
import { workerPr } from '../../../shared/status';
import type { Ctx } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import { pastTheWing, seatBuilt } from '../../core/floors';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { noOutline } from '../../core/outline';
import type { Parts } from '../../core/parts';
import { waitingOnSomeone } from '../../notify';
import { renderTitle } from '../../shared/title';
import { store } from '../../state';
import { $ } from '../../ui/dom';
import { openExpand } from '../../ui/floorplan';
import { renderWorkers } from '../../ui/workers-panel';
import { renderLimits } from '../../ui/limits';
import { modelBadge, providerLabel } from '../../ui/provider';
import { renderUsage } from '../../ui/usage';
import { Worker } from '../../world/character';
import { loadAgentVisual } from '../../world/character/agent-assets';
import { sanitizeAgentAppearance, agentAppearanceForId } from '../../../shared/agent-appearance';
import type { DeskView } from '../../world/types';
import { Laptop } from './laptop';
import { Arrivals, Departures } from './leaving';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    expand: true;
  }
}

export interface WorkerView {
  model: Worker;
  laptop: Laptop;
  deskId: string;
  status: string;
  acked: boolean;
}

/** How close (meters) you stop a worker jumping, and how far you go before it starts again. */
const HOLD_NEAR = 4;
const HOLD_LEAVE = 5;

export type WorkerViewsParts = Pick<Parts, 'stage' | 'worlds' | 'travel' | 'rooftop' | 'notifier' | 'waiting' | 'peers'>;

/**
 * Registers what follows the workers, the jail, the floor plan, the meeting, the pull requests and
 * the queue, the theme, and what's been spent (see the order below), and the workers' own tick.
 */
export function installWorkerViews(ctx: Ctx, core: CoreState, parts: WorkerViewsParts) {
  const { scene, sound, player, camera, office, sky, confetti, net } = ctx;
  const { plan, groundHere, officeWing, inOffice } = parts.worlds;

  const workerViews = new Map<string, WorkerView>();
  /** Workers a `worker.remove` is taking out of the store right now. They walk out of the building; a worker that's gone because you changed floors just vanishes. */
  const sentHome = new Set<string>();
  // Workers sent home, packing up and walking out with a box of their things.
  const departures = new Departures(
    scene,
    groundHere,
    (x, y, z) => sound.stepAt(x, z, y),
    () => arrangeSeats(),
    () => ctx.world().ways,
  );
  // Workers called to a meeting, walking in from the elevator (or the doors) to the meeting table.
  const arrivals = new Arrivals(
    scene,
    groundHere,
    (x, y, z) => sound.stepAt(x, z, y),
    () => ctx.world().ways,
  );
  /** Set while a floor's workers arrive with it (a welcome, an elevator ride): they're in their seats already. */
  let seatedAlready = false;
  /** A floor arriving (a welcome, a floor.enter): nobody's still leaving or coming in, and its workers are seated already. */
  function seatedOnArrival() {
    departures.clear();
    arrivals.clear();
    seatedAlready = true;
  }

  function assignDesk(v: WorkerView, desk: DeskView) {
    departures.vacate(desk.def.id);
    v.deskId = desk.def.id;
    v.model.setVisualSeat(desk.def.station ? undefined : desk.seatAnchor);
    const beside = desk.def.station ? new THREE.Vector3(0.62, 0.9, 0) : new THREE.Vector3(0.64, 0.5, -0.1);
    v.model.setPropSpot(desk.seatAnchor.worldToLocal(desk.laptopAnchor.localToWorld(beside)));
    desk.laptopAnchor.add(v.laptop.root);
    noOutline(desk.group);
    desk.chair.rotation.y = 0;
  }

  function syncWorkers() {
    const world = ctx.world();
    for (const w of store.workers.values()) {
      let v = workerViews.get(w.id);
      const desk = world.desks.get(w.deskId);
      if (!desk) continue;
      if (!v) {
        const model = new Worker(w.name, w.color);
        desk.seatAnchor.add(model.root);
        if (w.kind === 'agent') {
          void loadAgentVisual(sanitizeAgentAppearance(w.appearance) ?? agentAppearanceForId(w.id)).then(visual => {
            model.setVisual(visual);
            noOutline(model.root);
          }).catch(error => console.warn('Agent avatar could not be loaded', error));
        }
        // Called to a meeting just now: out of the elevator and over to the table, one after another.
        if (desk.def.room && !seatedAlready) arrivals.add(model, desk);

        v = { model, laptop: new Laptop(), deskId: w.deskId, status: '', acked: true };
        assignDesk(v, desk);
        workerViews.set(w.id, v);
      } else if (v.deskId !== w.deskId) {
        const previous = world.desks.get(v.deskId);
        assignDesk(v, desk);
        if (previous && !seatedAlready) arrivals.transfer(v.model, previous, desk, world.nav);
        else arrivals.sit(v.model, desk);
      }
      if (v.status !== w.status || v.acked !== w.acked) {
        // It just finished or started waiting on you (not already so when this page first saw it): ding (one that needs you has an alarm of its own, see features/needsyou), and notify if you're away.
        if (waitingOnSomeone(w) && v.status !== '' && w.status !== v.status) {
          if (w.status === 'done') sound.ding('done');
          parts.notifier.alert(w);
          // Playing at the arcade: one of yours stops the game.
        }
        // Finished what it was on: a little spin and a puff of confetti.
        if (w.status === 'done' && (v.status === 'working' || v.status === 'needs_input')) {
          v.model.celebrate();
          burstOver(w.deskId, 40);
        }
        v.status = w.status;
        v.acked = w.acked;
        v.model.setStatus(w.status, waitingOnSomeone(w));
        noOutline(v.model.root);
      }
      v.model.setAction(w.action);
      v.model.setPr(workerPr(w, store.pulls.items, store.queue.tasks));
      v.model.setLost(!!w.lost);
      const engineBadge = w.kind === 'agent' ? modelBadge(w.provider, w.model, w.effort, w.usage?.model) : undefined;
      v.model.setTask(meetingCard(w) ?? (w.task && w.kind === 'agent' ? { ...w.task, name: `${providerLabel(w.provider, store.project)}${engineBadge ? ` · ${engineBadge}` : ''} · ${w.task.name}` } : w.task));
      const deskDef = plan().byId.get(w.deskId);
      // Keys clack while it types, not while it reads, watches its tests or browses.
      if (deskDef) sound.setTyping(w.id, deskDef.x, deskDef.z, w.status === 'working' && (!w.action || w.action === 'edit'));
      const again = w.kind === 'shell' ? 'restart' : 'resume';
      v.laptop.setPlaceholder(w.lost ? uiText`🌿 ${w.name}'s worktree was deleted — press E to fix it` : w.status === 'offline' ? uiText`💤 ${w.name} is asleep — press R to ${again}` : w.status === 'exited' ? uiText`${w.name} exited` : 'booting…');
    }
    for (const [id, v] of workerViews) {
      if (store.workers.has(id)) continue;
      arrivals.forget(v.model);
      const desk = world.desks.get(v.deskId);
      // Sent home: pack up and walk out; the seat becomes free once the worker stands up.
      if (desk && sentHome.has(id)) {
        const { root } = v.model;
        const from = root.parent === desk.seatAnchor ? undefined : root.getWorldPosition(new THREE.Vector3());
        departures.add(v.model, v.laptop, desk, from && [from.x, from.z]);
      } else {
        v.model.root.removeFromParent();
        v.laptop.root.removeFromParent();
        v.model.dispose();
        v.laptop.dispose();
      }
      sound.removeTypist(id);
      workerViews.delete(id);
    }
    arrangeSeats();
    renderWorkers((id) => parts.waiting.openWorkerTerminal(id));
    parts.waiting.renderWaiting();
    parts.notifier.sync(store.workers);
    renderTitle();
  }

  /**
   * The card over a worker at the meeting table: its role, the round, and whether it has the floor
   * (working on its part) or is listening while the others work on theirs.
   */
  function meetingCard(w: WorkerInfo): WorkerTask | undefined {
    const m = store.meeting.current;
    if (!w.meeting || !m || m.id !== w.meeting) return undefined;
    const i = m.seats.findIndex((s) => s.workerId === w.id);
    if (i < 0) return undefined;
    const role = m.seats[i].role;
    const p = MEETING_PATTERNS[m.pattern];
    if (m.status !== 'running') return { name: `${role} · ${p.icon} ${p.label}`, summary: m.status === 'done' ? uiText`✅ The meeting wrote ${m.output}` : uiText`⛔ Stopped: ${m.reason ?? 'stopped'}` };
    const t = m.turns.find((x) => x.seat === i);
    if (!t || t.state === 'done') return { name: uiText`👂 ${role} · round ${m.round} of ${m.rounds}`, summary: t ? uiText('Part written: listening') : uiText('Listening') };
    return { name: uiText`💬 ${role} · round ${m.round} of ${m.rounds}`, summary: t.state === 'working' ? t.doing : uiText`${t.doing} (up next)` };
  }

  /**
   * A seat or kiosk shows it's free (its '+', or the board agent waiting there) only while nobody's at
   * it, and once every desk is taken, bean bags come out for the workers who don't fit.
   */
  function arrangeSeats() {
    if (!officeLoaded(ctx.office)) return;
    const world = ctx.world();
    // Someone sent home still counts until they get up, so a bean bag stays out under them.
    const free = vacantSeats(store.workers.values(), (id) => departures.seated(id));
    for (const [id, desk] of world.desks) desk.vacancy.visible = free.has(id) && seatBuilt(id);
    const appeared = world.setBeanbags(beanbagsOut((id) => !free.has(id), store.floorPlan.wing));
    // One came out right where you're standing (on the office floor, not down in the garage): you end up on top of it.
    const p = player.pos;
    for (const c of appeared) if (p.y > -0.1 && p.y < c.top && p.x > c.minX - 0.3 && p.x < c.maxX + 0.3 && p.z > c.minZ - 0.3 && p.z < c.maxZ + 0.3) p.y = c.top;
  }
  store.on('workers', syncWorkers);
  const workerPos = new THREE.Vector3();
  ctx.ticks.add('others', ({ dt, t }) => {
    const camPos = camera.position;
    for (const [id, v] of workerViews) {
      const desk = plan().byId.get(v.deskId)!;
      // A jumping worker holds still while you're near enough to read its card, and jumps again once you walk away.
      const d = v.model.root.getWorldPosition(workerPos).distanceTo(player.pos);
      v.model.held = d < (v.model.held ? HOLD_LEAVE : HOLD_NEAR);
      v.model.update(dt, t);
      // A board agent's kiosk has no laptop to paint (see buildKiosk).
      if (!desk.station) v.laptop.update(dt, store.screens.get(id), Math.hypot(desk.x - camPos.x, desk.z - camPos.z));
    }
    for (const a of parts.worlds.idleAgents()) if (a.view.vacancy.visible) a.model.update(dt, t);
    departures.update(dt, t);
    arrivals.update(dt);
  });

  /** The floor plan last shown, to tell someone knocking through from arriving on a floor already built out. */
  let shownPlan: { floor: string | null; wing: number } = { floor: null, wing: 0 };
  /**
   * The floor's back office, as far as it's built out, and the signs over its desks. Everything that
   * finds its way round the floor learns how far it goes; a row knocked through goes up in a puff of
   * dust, and anyone standing past where it goes now steps back in first.
   */
  function syncPlan() {
    if (!officeLoaded(office)) return;
    const fp = store.floorPlan;
    const level = officeWing();
    const was = shownPlan;
    shownPlan = { floor: store.floor, wing: level };
    const p = player.pos;
    if (inOffice() && pastTheWing(p, level)) {
      // Out to the side aisle of what's left, or back into the room.
      const side = p.x < (WING.minX + WING.maxX) / 2 ? WING.minX + 0.6 : WING.maxX - 0.6;
      p.set(level ? side : p.x, 0, level ? wingMinZ(level) + 0.6 : FLOOR.minZ + 1.6);
    }
    office.setWing(level);
    office.signs.set(fp.labels, (d) => deskBuilt(d, level));
    player.wing = sound.wing = level;
    sky.setWing(level);
    parts.travel.syncStack();
    parts.rooftop.syncRoof();
    arrangeSeats();
    if (was.floor === store.floor && level > was.wing) {
      const at = { x: (WING.minX + WING.maxX) / 2, y: 1.2, z: wingRowZ(level) };
      confetti.burst(at.x, 2.4, at.z, 140, 0.8);
      sound.construction(at);
    }
  }
  store.on('floorPlan', syncPlan);
  ctx.interactions.define('expand', {
    reach: 8,
    hint: () => {
      const level = store.floorPlan.wing;
      if (level >= WING.rows) return { k: 'full', parts: [hintTitle(uiText('🏢 Back office')), aside(uiText('built all the way out')), key('E', uiText('Wall a row up'))] };
      return { k: String(level), parts: [hintTitle(level ? uiText('🚧 Room to grow') : uiText('🚧 Room to grow through the wall')), aside(level ? uiText`${level} of ${WING.rows} rows built` : uiText('the office can get bigger here')), key('E', level ? uiText('Another row: 2 more desks') : uiText('Knock through: 2 more desks'))] };
    },
    use: onE(() => openExpand(net)),
  });
  // A worker at the meeting table shows its role and round over its head (see meetingCard).
  store.on('meeting', syncWorkers);
  // A worker's bubble shows whether it has a pull request open (green) or merged (purple: send it home).
  const paintPrs = () => {
    for (const [id, v] of workerViews) {
      const w = store.workers.get(id);
      if (w) v.model.setPr(workerPr(w, store.pulls.items, store.queue.tasks));
    }
  };
  store.on('pulls', paintPrs);
  store.on('queue', paintPrs);
  store.on('workers', renderUsage);

  store.on('usage', renderUsage);
  store.on('limits', renderLimits);
  // The reset countdowns tick down between reads.
  setInterval(renderLimits, 30_000);
  $('limits').addEventListener('click', () => net.send({ t: 'limits.refresh' }));

  /** Where confetti comes from over a desk: above the worker's head. */
  function burstOver(deskId: string, n: number) {
    const d = plan().byId.get(deskId);
    if (d) confetti.burst(d.x, 2.3, d.z, n);
  }

  return {
    /** The workers on this floor, as they're drawn at their desks. */
    workerViews,
    departures,
    arrivals,
    seatedOnArrival,
    /** A `worker.remove` is taking `id` out of the store: it walks out of the building. */
    sendingHome: (id: string) => void sentHome.add(id),
    /** The store has the message: whoever arrives or goes from now on isn't part of arriving on a floor. */
    settled() {
      seatedAlready = false;
      sentHome.clear();
    },
    syncWorkers,
    syncPlan,
    burstOver,
  };
}
