/** The fixed office world and the board agents waiting at its kiosks. */
import { ROOF } from '../../shared/rooftop';
import { groundAt } from '../player';
import { store } from '../state';
import { officeWorld } from '../world/world';
import type { Ctx } from './context';
import { idleAgentsIn } from './stations';

export function createWorlds(ctx: Ctx) {
  const { office } = ctx;
  const world = officeWorld(office, () => office.stack.state.index > 0, () => officeWing());
  const idle = idleAgentsIn(world);
  function officeWing(): number {
    return store.floor !== ROOF ? store.floorPlan.wing : 0;
  }
  return {
    world: () => world,
    idleAgents: () => idle,
    inOffice: () => true,
    plan: () => world.plan,
    officeWing,
    groundHere: (x: number, z: number, y: number) => Math.max(groundAt(world.colliders, x, z, y), ctx.player.street),
  };
}
