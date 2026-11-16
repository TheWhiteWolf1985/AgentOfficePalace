import type { Ctx } from '../../core/context';
import { builtFloors, floorWings } from '../../core/floors';
import { noOutline } from '../../core/outline';
import { store } from '../../state';
import { LOBBY } from '../../../shared/rooftop';
import { buildAtrium } from './world';

/** A permanent ground floor, independent of the list of project offices. */
export function installAtrium(ctx: Ctx) {
  let atrium: ReturnType<typeof buildAtrium> | null = null;
  function syncAtrium() {
    if (atrium) atrium.city.setFloors(builtFloors().length, floorWings(builtFloors()), true);
  }
  function theAtrium() {
    if (!atrium) {
      atrium = buildAtrium(ctx.office.night);
      syncAtrium();
      atrium.group.visible = false;
      ctx.scene.add(atrium.group);
      noOutline(atrium.group);
    }
    return atrium;
  }
  store.on('floors', syncAtrium);
  ctx.ticks.add('env', ({ dt, t }) => {
    if (store.floor !== LOBBY || !atrium) return;
    atrium.elevator.update(dt);
    atrium.city.update(t, dt, ctx.sky.lampsOn);
  });
  return { atrium: () => atrium, theAtrium };
}
