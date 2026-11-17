/** The shared meeting room exists independently of project floors. */
import { roofDrop } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import { builtFloors, floorWings } from '../../core/floors';
import { noOutline } from '../../core/outline';
import { store } from '../../state';
import { buildRooftop, type Rooftop } from './world';
import { refreshWhiteboard } from '../whiteboard/ui';

export function installRooftop(ctx: Ctx) {
  let roof: Rooftop | null = null;
  function theRoof(): Rooftop {
    if (!roof) {
      roof = buildRooftop(ctx.office.night);
      roof.setFloors(roofFloors(), floorWings(builtFloors()));
      roof.group.visible = false;
      ctx.scene.add(roof.group);
      noOutline(roof.group);
      refreshWhiteboard();
    }
    return roof;
  }
  const roofFloors = () => builtFloors().length;
  function syncRoof() {
    if (!roof) return;
    roof.setFloors(roofFloors(), floorWings(builtFloors()));
    if (ctx.upTop()) ctx.sky.setRoof(true, roofDrop(roofFloors()));
  }
  store.on('floors', syncRoof);
  ctx.ticks.add('env', ({ dt, t }) => {
    if (!ctx.upTop() || !roof) return;
    const people = [ctx.player.pos, ...[...store.peers.values()].filter((p) => p.id !== store.you && store.onMyFloor(p))];
    roof.update(t, dt, ctx.sky.lampsOn, people);
  });
  return { roof: () => roof, theRoof, roofFloors, syncRoof };
}
