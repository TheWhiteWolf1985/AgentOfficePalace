import { t } from './i18n.js';
import type { SeatDef } from './layout.js';
import { CONFERENCE_DATA } from './conference-room-data.js';

export { CONFERENCE_DATA };
export const CONFERENCE_SEATING: SeatDef[] = CONFERENCE_DATA.seats.map((s) => ({
  id: s.id, label: s.role === 'lounge' ? t('🛋️ Lounge seat') : t('🪑 Meeting seat'),
  x: s.position.x, y: 0, z: s.position.z, rotY: Math.atan2(s.facing.x, s.facing.z),
  places: [0], hips: s.position.y, depth: 0, out: 1, roof: true, stand: s.stand,
}));

/** The application's box collision convention, converted from the supplied Blender manifest. */
export const CONFERENCE_COLLIDERS = CONFERENCE_DATA.colliders.map((c) => ({ ...c }));
