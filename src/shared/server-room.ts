import { t } from './i18n.js';
import type { SeatDef } from './layout.js';
import { SERVER_ROOM_DATA } from './server-room-data.js';
export { SERVER_ROOM_DATA };
export const SERVER_ROOM_COLLIDERS = SERVER_ROOM_DATA.colliders.map(c => ({ ...c }));
export const SERVER_ROOM_SEATING: SeatDef[] = SERVER_ROOM_DATA.seats.map(s => ({
  id: s.id, label: t('🪑 Operator seat'), x: s.position.x, y: 0, z: s.position.z,
  rotY: Math.atan2(s.facing.x, s.facing.z), places: [0], hips: s.position.y,
  depth: 0, out: 1, server: true, stand: s.stand,
}));
