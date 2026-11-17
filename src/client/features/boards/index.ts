import { officeLoaded, whenOfficeReady } from '../../world/deferred-office';
import { lazyResource } from '../../lazy-resource';
import { t as uiText } from '../../../shared/i18n';
/**
 * The boards on the walls: the issues board (the open issues nobody has started on, less the cards
 * someone's carrying around), the PR board, the services board, the task queue, the machine monitor
 * and the meeting room's two. What E does at each is defined with it.
 */
import type * as THREE from 'three';
import type { GhIssue } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';
import { aside, boardHint, hintTitle, key, onE } from '../../core/hint';
import { store, type Topic } from '../../state';
import { openBoard } from '../../ui/boards';
import { inProgress } from '../../ui/github/progress';
import type { BoardActions } from '../../ui/github/prompts';
import { clip } from '../../ui/dom';
import { openIssue } from '../../ui/pull';
import { openServices } from '../../ui/services';
import { BoardTexture, QueueBoardTexture, ServicesBoardTexture } from './world';
import { MachineTexture } from './machine';
import { MeetingBoardTexture, MeetingSignTexture } from './meeting';
import type { World } from '../../world/world';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    issues: true;
    pulls: true;
    services: true;
    queue: true;
  }
}

export interface BoardsDeps {
  /** The note on the issues board you're pointing at, if any (see aimedNote in input/pointer.ts). */
  aimedNote(): GhIssue | null;
  /** Takes an issue's card off the board, into your hands (see features/carrying). */
  pickUp(it: GhIssue): void;
  /** What a board's buttons do: hand an issue to a worker, call a meeting about it… */
  boardActions(): BoardActions;
  /** The task queue's window. */
  showQueue(): void;
}

export function installBoards(ctx: Ctx, deps: BoardsDeps) {
  const { office } = ctx;
  // Boards: each draws onto a canvas texture, redrawn whenever what it shows changes. The same
  // texture goes on that board in whichever world you're in (see dressBoards).
  function mountBoard(mesh: () => THREE.Mesh | undefined, texture: () => THREE.Texture, render: () => void, topics: Topic[]) {
    whenOfficeReady(office, () => {
      const face = mesh();
      if (face) showOn(face, texture());
      for (const topic of topics) store.on(topic, render);
      render();
    });
  }
  function showOn(mesh: THREE.Mesh, texture: THREE.Texture) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    if (mat.map === texture) return;
    mat.map = texture;
    mat.needsUpdate = true;
  }
  /** Issues whose cards someone on this floor is carrying around, so they're missing from the board. */
  function offBoard(): Set<number> {
    const off = new Set<number>();
    const carrying = ctx.carrying();
    if (carrying) off.add(carrying.issue);
    for (const p of store.peers.values()) if (p.carrying && p.id !== store.you && store.onMyFloor(p)) off.add(p.carrying.issue);
    return off;
  }
  const issues = lazyResource(() => new BoardTexture('issues'));
  // Aim checks run even in common spaces; these handles must never allocate an office canvas.
  const issuesTex = {
    get hasNotes() { return issues.peek()?.hasNotes ?? false; },
    noteAt: (uv: THREE.Vector2) => issues.peek()?.noteAt(uv),
    lift: (number: number | null) => issues.peek()?.lift(number),
  };
  // The cork holds the issues nobody has started on: one that's in progress comes off it, as a closed one does.
  const renderIssuesBoard = () => {
    const board = issues.peek();
    if (!board) return;
    const off = offBoard();
    board.render({ ...store.issues, items: store.issues.items.filter((i) => !off.has(i.number) && !inProgress(i, store.taskForIssue(i.number))) });
  };
  // The queue too: a task that starts running takes its issue off the board before GitHub says it's assigned.
  mountBoard(() => office.boardMeshes.issues, () => issues.get().texture, renderIssuesBoard, ['issues', 'queue']);
  let carriedOff = '';
  store.on('peers', () => {
    const k = [...offBoard()].join(',');
    if (k === carriedOff) return;
    carriedOff = k;
    renderIssuesBoard();
  });
  /** Your card came off the board or went back on it (see features/carrying). */
  function cardMoved() {
    carriedOff = [...offBoard()].join(',');
    renderIssuesBoard();
  }
  const pulls = lazyResource(() => new BoardTexture('pulls'));
  const renderPullsBoard = () => pulls.peek()?.render(store.pulls, store.workers);
  mountBoard(() => office.boardMeshes.pulls, () => pulls.get().texture, renderPullsBoard, ['pulls']);
  // PR notes name the desk they came from. Redraw when that changes, not on every worker update.
  let deskLinks = '';
  store.on('workers', () => {
    const k = JSON.stringify([...store.workers.values()].filter((w) => w.worktree).map((w) => [w.worktree!.branch, w.pr?.number, w.name, w.color, w.deskId]));
    if (k === deskLinks) return;
    deskLinks = k;
    renderPullsBoard();
  });
  const services = lazyResource(() => new ServicesBoardTexture());
  const renderServicesBoard = () => services.peek()?.render(store.services.items, store.workers);
  mountBoard(() => office.boardMeshes.services, () => services.get().texture, renderServicesBoard, ['services', 'workers']);
  const queue = lazyResource(() => new QueueBoardTexture());
  const renderQueueBoard = () => queue.peek()?.render(store.queue, store.workers);
  mountBoard(() => office.boardMeshes.queue, () => queue.get().texture, renderQueueBoard, ['queue', 'workers']);
  ctx.interactions.define('issues', {
    reach: 9,
    hint: () => {
      const aimedNote = deps.aimedNote();
      if (aimedNote) return { k: String(aimedNote.number), parts: [hintTitle(clip(`📌 #${aimedNote.number} ${aimedNote.title}`, 60)), key('E', uiText('Take it')), key('O', uiText('Read it'))] };
      return issuesTex.hasNotes ? { k: 'notes', parts: [hintTitle(uiText('📌 Issues board')), key('E', uiText('Open')), aside(uiText('or point at a note to take it'))] } : boardHint(uiText('📌 Issues board'));
    },
    use: (_it, key, note) => {
      // A note on the issues board: E takes it straight off the cork, O opens it to read first.
      if (note && key === 'E') return deps.pickUp(note);
      if (note && key === 'O') return openIssue(note, ctx.net, deps.boardActions());
      if (key === 'E') openBoard('issues', ctx.net, deps.boardActions());
    },
  });
  ctx.interactions.define('pulls', {
    reach: 9,
    hint: () => boardHint(uiText('🔀 Pull request board')),
    use: onE(() => openBoard('pulls', ctx.net, deps.boardActions())),
  });
  ctx.interactions.define('services', {
    reach: 9,
    hint: () => boardHint(uiText('🌐 Services board')),
    use: onE(() => openServices()),
  });
  ctx.interactions.define('queue', {
    reach: 9,
    hint: () => {
      const n = store.queue.tasks.filter((t) => t.status !== 'done').length;
      return { k: String(n), parts: [hintTitle(uiText`📋 Task queue${n ? ` · ${n}` : ''}`), key('E', uiText('Open'))] };
    },
    use: onE(() => deps.showQueue()),
  });
  // The machine monitor on the west wall.
  const machine = lazyResource(() => new MachineTexture());
  mountBoard(() => office.machineScreen, () => machine.get().texture, () => machine.peek()?.render(store.machine), ['machine']);
  // The meeting room: its output as it's written on the back wall, and how it's going on the door.
  const meetingBoard = lazyResource(() => new MeetingBoardTexture());
  mountBoard(() => office.meetingBoard, () => meetingBoard.get().texture, () => meetingBoard.peek()?.render(store.meeting), ['meeting']);
  const meetingSign = lazyResource(() => new MeetingSignTexture());
  mountBoard(() => office.meetingSign, () => meetingSign.get().texture, () => meetingSign.peek()?.render(store.meeting), ['meeting']);
  /** Puts every board's texture up on `w`'s boards. */
  function dressBoards(w: World) {
    if (!officeLoaded(office)) return;
    showOn(w.boardMeshes.issues, issues.get().texture);
    showOn(w.boardMeshes.pulls, pulls.get().texture);
    showOn(w.boardMeshes.services, services.get().texture);
    showOn(w.boardMeshes.queue, queue.get().texture);
    if (w.meetingBoard) showOn(w.meetingBoard, meetingBoard.get().texture);
    if (w.meetingSign) showOn(w.meetingSign, meetingSign.get().texture);
  }

  return { issuesTex, renderPullsBoard, renderServicesBoard, renderQueueBoard, dressBoards, cardMoved };
}
