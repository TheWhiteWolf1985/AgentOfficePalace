import { ATRIUM_COLLIDERS } from './atrium.js';
import { FLOOR } from './layout.js';
import { NavGrid } from './nav.js';
let grid: NavGrid | undefined;
/** Ground-floor routes use the delivered furniture, never project office desks. */
export function atriumRoute(from: { x: number; z: number }, to: { x: number; z: number }) {
  grid ??= new NavGrid(FLOOR, {
    rects: ATRIUM_COLLIDERS.filter((c) => c.top > 0.3 && c.bottom < 1.7).map((c) => [c.minX, c.maxX, c.minZ, c.maxZ]), circles: [],
  });
  return grid.route([from.x, from.z], [to.x, to.z]).map(([x, z]) => ({ x, z }));
}
