/** The human walking route through the shared room, using its real furniture footprint. */
import { CONFERENCE_COLLIDERS } from './conference-room.js';
import { FLOOR } from './layout.js';
import { NavGrid } from './nav.js';
let grid: NavGrid | undefined;
export function conferenceRoute(from: { x: number; z: number }, to: { x: number; z: number }) {
  grid ??= new NavGrid(FLOOR, {
    rects: CONFERENCE_COLLIDERS.filter((c) => c.role !== 'door_closed' && c.top > 0.3 && c.bottom < 1.7).map((c) => [c.minX, c.maxX, c.minZ, c.maxZ]),
    circles: [],
  });
  return grid.route([from.x, from.z], [to.x, to.z]).map(([x, z]) => ({ x, z }));
}
