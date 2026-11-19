import { serverDrop } from '../../../shared/layout';
import { SERVER_ROOM } from '../../../shared/rooftop';
import type { Ctx } from '../../core/context';
import { builtFloors, floorWings } from '../../core/floors';
import { noOutline } from '../../core/outline';
import { store } from '../../state';
import { buildServerRoom } from './world';

export function installServerRoom(ctx: Ctx) {
  let room: ReturnType<typeof buildServerRoom> | null = null;
  function sync() {
    if (!room) return;
    const floors = builtFloors(); room.exterior.setFloors(floors.length, floorWings(floors));
    if (store.floor === SERVER_ROOM) ctx.sky.setRoof(true, serverDrop(floors.length));
  }
  function theServerRoom() {
    if (!room) {
      room = buildServerRoom(ctx.office.night); sync(); room.group.visible = false;
      ctx.scene.add(room.group); noOutline(room.group);
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
