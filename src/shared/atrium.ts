import { t } from './i18n.js';
import type { SeatDef } from './layout.js';
import { ATRIUM_DATA } from './atrium-data.js';
export { ATRIUM_DATA };
export const ATRIUM_SEATING: SeatDef[] = ATRIUM_DATA.seats.map((s) => ({
  id: s.id, label: t('🛋️ Lounge seat'), x: s.position.x, y: 0, z: s.position.z,
  rotY: Math.atan2(s.facing.x, s.facing.z), places: [0], hips: s.position.y,
  depth: 0, out: 1, lobby: true, stand: s.stand,
}));
export const ATRIUM_COLLIDERS = ATRIUM_DATA.colliders.map((c) => ({ ...c }));
