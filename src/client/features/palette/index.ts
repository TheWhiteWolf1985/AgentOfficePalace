import { t as uiText } from '../../../shared/i18n';
/**
 * The command palette (Ctrl+K, ⌘K on a Mac): the workers, the office's actions, its boards, the pull
 * requests, issues and services, and the people in it. Enter does it; Shift+Enter walks you over to
 * where it's done first.
 */
import { DESK_BY_ID, DESKS, WING_DESKS, deskSeat, type DeskDef } from '../../../shared/layout';
import { isPaletteKey } from '../../../shared/palette';
import type { Ctx } from '../../core/context';
import { seatBuilt } from '../../core/floors';
import type { Parts } from '../../core/parts';
import { STATION_INFO } from '../../core/stations';
import { isTyping } from '../../player';
import { store } from '../../state';
import { openAccounts } from '../../ui/accounts';
import { openBoard } from '../../ui/boards';
import { STATUS_LABEL, toast } from '../../ui/dom';
import { paletteOpen, togglePalette, type PaletteEntry } from '../../ui/palette';
import { openIssue, openPull } from '../../ui/pull';
import { openServices, serviceUrl } from '../../ui/services';
import { openTeam } from '../../ui/team';
import { IS_MAC } from '../../ui/termkeys';
import { hasWhiteboard, openWhiteboard } from '../whiteboard/ui';
import type { InteractKind, Interactable } from '../../world/types';

export type PaletteParts = Pick<Parts, 'walking' | 'waiting' | 'actions' | 'hud' | 'hanging' | 'meeting' | 'rooftop'>;

/** Listens for Ctrl+K (⌘K) on the window. */
export function installPalette(ctx: Ctx, parts: PaletteParts) {
  const { office, player, net } = ctx;
  const walkThen = (...a: Parameters<Parts['walking']['walkThen']>) => parts.walking.walkThen(...a);
  const showQueue = () => parts.waiting.showQueue();
  const showSearch = () => parts.waiting.showSearch();

  /** Where you stand to use something of this kind on this floor, like the Issues board. */
  function spotOf(kind: InteractKind): Interactable | undefined {
    if (ctx.upTop()) return parts.rooftop.roof()?.interactables.find((it) => it.kind === kind && !it.off);
    return office.interactables.find((it) => it.kind === kind && !it.off);
  }

  /** Where you stand at a desk: behind the worker, looking over their shoulder (as standAt), or by a chair at the meeting table. */
  function deskSpot(desk: DeskDef): { x: number; z: number } | undefined {
    if (desk.room) return office.interactables.find((it) => it.deskId === desk.id);
    return deskSeat(desk, desk.station ? -1.6 : desk.beanbag ? 1.6 : 2.4);
  }

  /** The free desk nearest you, for hiring from the palette. */
  function nearestFreeDesk(): DeskDef | undefined {
    let best: DeskDef | undefined;
    let bestD = Infinity;
    for (const d of [...DESKS, ...WING_DESKS]) {
      if (store.workerAtDesk(d.id) || !office.desks.has(d.id) || !seatBuilt(d.id)) continue;
      const dist = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** An entry that walks you over to `kind`'s spot (Shift+Enter) before doing what Enter does. */
  function at(kind: InteractKind, what: string, entry: Omit<PaletteEntry, 'walk'>): PaletteEntry {
    const it = spotOf(kind);
    return { ...entry, walk: it ? () => walkThen(it, what, entry.open) : undefined };
  }

  /** Everything the palette finds, in the order it lists them before you type. */
  function paletteEntries(): PaletteEntry[] {
    const { waiting, actions, meeting, hanging } = parts;
    const out: PaletteEntry[] = [];
    for (const w of store.workers.values()) {
      const desk = DESK_BY_ID.get(w.deskId);
      const spot = desk && deskSpot(desk);
      const open = () => waiting.openWorkerTerminal(w.id);
      out.push({
        icon: desk?.station ? STATION_INFO[desk.station].icon : w.kind === 'shell' ? '🐚' : '🧑‍💻',
        kind: uiText('Worker'),
        title: w.name,
        detail: [w.task?.name, desk?.label, STATUS_LABEL[w.status]].filter(Boolean).join(' · '),
        keywords: [w.title, w.worktree?.branch],
        open,
        walk: desk && spot ? () => walkThen(spot, uiText`${w.name} at ${desk.label}`, open, desk) : undefined,
      });
    }

    const free = nearestFreeDesk();
    const hireAt = (d: DeskDef) => () => actions.hireAtDesk(d.id);
    out.push({
      icon: '✨',
      kind: uiText('Action'),
      title: uiText('Hire a worker'),
      detail: free ? uiText`At ${free.label}, the free desk nearest you` : uiText('Every desk is taken'),
      keywords: [uiText('new worker'), uiText('spawn an agent')],
      open: free ? hireAt(free) : () => toast(uiText('Every desk on this floor is taken'), 'warn'),
      walk: free ? () => walkThen(deskSpot(free)!, free.label, hireAt(free), free) : undefined,
    });
    out.push(at('queue', uiText('the task queue'), { icon: '📋', kind: uiText('Action'), title: uiText('Open the task queue'), detail: uiText('Issues and tasks waiting for a worker'), keywords: ['backlog', 'tasks'], open: showQueue }));
    out.push({ icon: '⚙️', kind: uiText('Action'), title: uiText('Settings'), keywords: ['preferences', 'options'], open: () => parts.hud.showSettings() });
    if (store.invites) out.push({ icon: '👥', kind: uiText('Action'), title: uiText('Invite teammates'), keywords: ['team', uiText('add people')], open: () => openTeam(net) });
    else if (store.me.admin) out.push({ icon: '👥', kind: uiText('Action'), title: uiText('Invite people'), detail: uiText('Accounts'), keywords: [uiText('invite teammates'), 'accounts', 'team'], open: () => openAccounts(net) });
    out.push({ icon: '🖼️', kind: uiText('Action'), title: uiText('Hang a picture'), detail: uiText('On a wall of this floor'), keywords: ['decorate', 'frame', 'art'], open: hanging.startHanging });
    out.push({ icon: '🔎', kind: uiText('Action'), title: uiText('Search the chat and every terminal'), keywords: ['find'], open: showSearch });

    out.push(at('issues', uiText('the Issues board'), { icon: '📌', kind: uiText('Board'), title: uiText('Issues board'), open: () => openBoard('issues', net, actions.boardActions()) }));
    out.push(at('pulls', uiText('the PR board'), { icon: '🔀', kind: uiText('Board'), title: uiText('PR board'), keywords: [uiText('pull requests')], open: () => openBoard('pulls', net, actions.boardActions()) }));
    out.push(at('services', uiText('the Services board'), { icon: '🌐', kind: uiText('Board'), title: uiText('Services board'), detail: uiText('Web servers the workers are running'), open: () => openServices() }));
    if (hasWhiteboard()) out.push(at('whiteboard', uiText('the whiteboard'), { icon: '📝', kind: uiText('Board'), title: ctx.upTop() ? uiText('Meeting room whiteboard') : uiText('Whiteboard'), open: () => openWhiteboard(net) }));
    out.push(at('meeting', uiText('the meeting room'), { icon: '🤝', kind: uiText('Board'), title: uiText('Meeting room'), keywords: [uiText('call a meeting')], open: () => meeting.showMeeting() }));

    for (const pr of store.pulls.items) {
      out.push(
        at('pulls', uiText('the PR board'), {
          icon: '🔀',
          kind: uiText('PR'),
          title: `#${pr.number} ${pr.title}`,
          detail: [pr.isDraft ? uiText('Draft') : pr.state.toLowerCase(), pr.headRefName, pr.author].join(' · '),
          open: () => openPull(pr, net, actions.boardActions()),
        }),
      );
    }
    for (const issue of store.issues.items) {
      out.push(
        at('issues', uiText('the Issues board'), {
          icon: '📌',
          kind: uiText('Issue'),
          title: `#${issue.number} ${issue.title}`,
          detail: [issue.state.toLowerCase(), ...issue.labels.map((l) => l.name), issue.author].join(' · '),
          open: () => openIssue(issue, net, actions.boardActions()),
        }),
      );
    }
    for (const svc of store.services.items) {
      const board = spotOf('services');
      out.push({
        icon: '🌐',
        kind: uiText('Service'),
        title: svc.title || svc.command,
        detail: [`:${svc.port}`, svc.title && svc.command, store.workers.get(svc.workerId)?.name].filter(Boolean).join(' · '),
        keywords: [String(svc.port)],
        // As its Open ↗ button does. A new tab needs the key press itself, so walking there shows the board instead.
        open: () => window.open(serviceUrl(svc.port), '_blank', 'noopener'),
        walk: board ? () => walkThen(board, uiText('the Services board'), () => openServices()) : undefined,
      });
    }
    for (const p of store.peers.values()) {
      if (p.id === store.you) continue;
      const floor = store.onMyFloor(p) ? uiText('On this floor') : uiText`On the ${store.floors.find((f) => f.id === p.floor)?.name ?? 'other'} floor`;
      // As clicking them under "In the office" does: over to them, by elevator if need be.
      out.push({ icon: '🙂', kind: uiText('Teammate'), title: p.name, detail: floor, open: () => parts.walking.walkTo(p.id) });
    }
    return out;
  }

  // Ctrl+K (⌘K on a Mac), from anywhere but a text box or a terminal, where the key is theirs: in a
  // shell, Ctrl+K cuts to the end of the line. In the palette's own box it puts the palette away.
  window.addEventListener('keydown', (e) => {
    if (!isPaletteKey(e, IS_MAC)) return;
    const inPalette = paletteOpen() && !!(e.target as HTMLElement | null)?.closest?.('.modal.palette');
    if (!inPalette && isTyping(e)) return;
    e.preventDefault();
    if (!e.repeat) togglePalette(paletteEntries);
  });

  return { paletteEntries };
}
