import { t as uiText } from '../../../shared/i18n';
import { serverDrop } from '../../../shared/layout';
import { SERVER_ROOM } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import { builtFloors, floorWings } from '../../core/floors';
import { noOutline } from '../../core/outline';
import { store } from '../../state';
import { buildServerRoom } from './world';
import { ServerPanelFeed } from './panels';
import { boardHint, onE } from '../../core/hint';
import { SERVER_PANELS } from '../../../shared/server-panels';
import { toast } from '../../ui/dom';

declare module '../../world/types' {
  interface InteractKinds {
    serverpanel: true;
  }
}

export function installServerRoom(ctx: Ctx) {
  let room: ReturnType<typeof buildServerRoom> | null = null;
  const feed=new ServerPanelFeed();
  const refresh=()=>room?.panels.update(feed.state,feed.error,store.me.admin);
  feed.on(refresh);
  const active=()=> {feed.setActive(store.floor===SERVER_ROOM && store.me.admin && !document.hidden);refresh();};
  store.on('floor',active);store.on('me',active);document.addEventListener('visibilitychange',active);
  ctx.interactions.define('serverpanel',{
    reach:7,
    hint:it=>boardHint(uiText(SERVER_PANELS.find(p=>p.id===it.panel)?.title??'Server room')),
    use:onE(it=> {
      if(!store.me.admin)return toast(uiText("Administrator access required"),'warn');
      if(it.panel)void import('./panels-ui').then(m=>m.openServerPanel(it.panel!,feed));
    }),
  });
  function sync() {
    if (!room) return;
    const floors = builtFloors(); room.exterior.setFloors(floors.length, floorWings(floors));
    if (store.floor === SERVER_ROOM) ctx.sky.setRoof(true, serverDrop(floors.length));
  }
  function theServerRoom() {
    if (!room) {
      room = buildServerRoom(ctx.office.night); sync(); room.group.visible = false;
      ctx.scene.add(room.group); noOutline(room.group);
      refresh();active();
    }
    return room;
  }
  store.on('floors', sync);
  ctx.ticks.add('env', ({ dt }) => {
    if (store.floor !== SERVER_ROOM || !room) return;
    room.update(dt, [ctx.player.pos, ...[...store.peers.values()].filter(p => p.id !== store.you && store.onMyFloor(p))]);
  });
  return { serverRoom: () => room, theServerRoom };
}
