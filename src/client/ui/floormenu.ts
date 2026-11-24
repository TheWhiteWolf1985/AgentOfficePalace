import { t as uiText } from '../../shared/i18n';
import './floormenu.css';
import { cloneLabel, floorPalette } from '../../shared/floors';
import { LOBBY, LOBBY_NAME, ROOF, ROOF_NAME, SERVER_ROOM, SERVER_ROOM_NAME } from '../../shared/rooftop';
import type { FloorInfo } from '../../shared/protocol';
import { store } from '../state';
import { h } from './dom';

// Building directory. Every destination uses the elevator.

export interface FloorMenuOptions {
  /** Ride to the selected floor. */
  go(floorId: string): void;
  /** Open the current office's expansion controls. */
  expand?(): void;
  /** Open the elevator's panel, to add a project. */
  elevator(): void;
  /** Up to the shared meeting room, by elevator; null on a map with no roof to go up to. */
  roof: (() => void) | null;
}

let current: { el: HTMLElement; close(): void } | null = null;

export function floorMenuOpen(): boolean {
  return !!current;
}

export function closeFloorMenu() {
  current?.close();
}

/** Opens the floor list under `anchor`, or closes it if it's open. */
export function toggleFloorMenu(anchor: HTMLElement, opts: FloorMenuOptions): void {
  if (current) return current.close();
  const el = h('div.floor-menu.panel', { role: 'menu', 'aria-label': uiText('Floors') });

  const item = (f: FloorInfo, i: number, here: number) => {
    const isHere = f.id === store.floor;
    const p = floorPalette(f.palette);
    const n = Math.abs(i - here);
    const where = isHere ? uiText('you are here') : here < 0 ? '' : uiText`${i > here ? '⬆' : '⬇'} ${n} floor${n === 1 ? '' : 's'} ${i > here ? 'up' : 'down'}`;
    const stats: HTMLElement[] = [];
    if (f.cloning) stats.push(h('span', { title: f.clone?.detail ?? uiText('Being cloned') }, cloneLabel(f.clone)));
    else {
      if (f.waiting) stats.push(h('span.waiting', { title: uiText('Workers waiting on someone') }, `🙋 ${f.waiting}`));
      if (f.busy) stats.push(h('span', { title: uiText('Working') }, `👷 ${f.busy}`));
      stats.push(h('span', { title: uiText('Workers at desks') }, `💻 ${f.workers}`));
      if (f.people) stats.push(h('span', { title: uiText('People on this floor') }, `🧑 ${f.people}`));
    }
    const btn = h(
      'button.floor-item',
      { type: 'button', role: 'menuitem', class: isHere ? 'here' : '', disabled: isHere || f.cloning, title: isHere ? uiText("You're on this floor") : f.cloning ? uiText('Still being cloned') : uiText`Go to ${f.name}, in its elevator` },
      h('span.floor-no', { style: `background:${p.trim}` }, String(i + 1)),
      h('span.floor-text', {}, h('span.floor-name', {}, f.name), h('span.floor-sub', {}, where || (f.repo ?? f.dir))),
      h('span.floor-stats', {}, ...stats),
    );
    btn.addEventListener('click', () => {
      if (isHere || f.cloning) return;
      close();
      opts.go(f.id);
    });
    return btn;
  };

  const render = () => {
    const floors = store.floors;
    const here = floors.findIndex((f) => f.id === store.floor);
    const add = h('button.floor-item.add', { type: 'button', role: 'menuitem', title: uiText('The elevator: add another project as a floor') }, h('span.floor-no', {}, '🛗'), h('span.floor-text', {}, h('span.floor-name', {}, uiText('Elevator')), h('span.floor-sub', {}, uiText('Add a project…'))));
    add.addEventListener('click', () => {
      close();
      opts.elevator();
    });
    // Top floor first, the way a building's directory reads, and the roof over them.
    const items = floors.map((f, i) => item(f, i, here)).reverse();
    const onRoof = store.floor === ROOF;
    const people = [...store.peers.values()].filter((p) => p.floor === ROOF).length;
    const roof = h(
      'button.floor-item',
      { type: 'button', role: 'menuitem', class: onRoof ? 'here' : '', disabled: onRoof, title: onRoof ? uiText("You're up on the roof") : uiText('Take the elevator up to the roof') },
      h('span.floor-no', { style: 'background:#2b2d42' }, '🤝'),
      h('span.floor-text', {}, h('span.floor-name', {}, ROOF_NAME), h('span.floor-sub', {}, onRoof ? uiText('you are here') : uiText('Shared meeting room · 19 seats'))),
      h('span.floor-stats', {}, people ? h('span', { title: uiText('People up there') }, `🧑 ${people}`) : ''),
    );
    roof.addEventListener('click', () => {
      if (onRoof) return;
      close();
      opts.roof?.();
    });
    const inLobby = store.floor === LOBBY;
    const lobby = h('button.floor-item', { type: 'button', role: 'menuitem', class: inLobby ? 'here' : '', disabled: inLobby },
      h('span.floor-no', { style: 'background:#2b2d42' }, '0'),
      h('span.floor-text', {}, h('span.floor-name', {}, LOBBY_NAME), h('span.floor-sub', {}, inLobby ? uiText('you are here') : uiText('Ground floor · reception and lounge'))));
    lobby.addEventListener('click', () => { if (!inLobby) { close(); opts.go(LOBBY); } });
    const inServer = store.floor === SERVER_ROOM;
    const server = h('button.floor-item', { type: 'button', role: 'menuitem', 'data-floor': SERVER_ROOM, class: inServer ? 'here' : '', disabled: inServer },
      h('span.floor-no', { style: 'background:#2b2d42' }, '🗄️'),
      h('span.floor-text', {}, h('span.floor-name', {}, SERVER_ROOM_NAME), h('span.floor-sub', {}, inServer ? uiText('you are here') : uiText('Server room · technical floor'))));
    server.addEventListener('click', () => { if (!inServer) { close(); opts.go(SERVER_ROOM); } });
    if (here >= 0 && opts.expand) {
      const expand = h('button.floor-item', { type: 'button', role: 'menuitem' }, uiText('🏢 Back office'));
      expand.addEventListener('click', () => { close(); opts.expand!(); });
      items.push(expand);
    }
    const count = floors.length + 3;
    el.replaceChildren(h('div.floor-menu-head', {}, uiText`🏢 ${count} floor${count === 1 ? '' : 's'}`), ...(opts.roof ? [roof] : []), server, ...items, lobby, add);
  };

  const place = () => {
    const r = anchor.getBoundingClientRect();
    el.style.left = `${r.left}px`;
    el.style.top = `${r.bottom + 8}px`;
  };

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!el.contains(t) && !anchor.contains(t)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const offs = [store.on('floors', render), store.on('floor', render)];
  const close = () => {
    if (current?.el !== el) return;
    current = null;
    el.remove();
    anchor.classList.remove('open');
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    for (const off of offs) off();
  };
  render();
  document.body.append(el);
  place();
  anchor.classList.add('open');
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', place);
  current = { el, close };
}
