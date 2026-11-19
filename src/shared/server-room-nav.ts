import { SERVER_ROOM_COLLIDERS } from './server-room.js';
import { FLOOR } from './layout.js';
import { NavGrid } from './nav.js';
let grid: NavGrid | undefined;
/** Routes use the delivered racks, partition and furniture; the automatic door clears the passage. */
export function serverRoomRoute(from: { x: number; z: number }, to: { x: number; z: number }) {
  grid ??= new NavGrid(FLOOR, {
    rects: SERVER_ROOM_COLLIDERS.filter(c => c.role !== 'access_door' && c.top > .3 && c.bottom < 1.7)
      .map(c => [c.minX, c.maxX, c.minZ, c.maxZ]), circles: [],
  });
  return grid.route([from.x, from.z], [to.x, to.z]).map(([x, z]) => ({ x, z }));
}
