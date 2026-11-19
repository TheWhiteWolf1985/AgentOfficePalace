import { t as uiText } from '../../shared/i18n';
import { BALCONY, FLOOR, LOFT, MEETING_ROOM, SEATING_BY_ID, WING, inWing, seatAt } from '../../shared/layout';
import type { PeerInfo } from '../../shared/protocol';
import { ROOF, SERVER_ROOM } from '../../shared/rooftop';

/**
 * What a teammate is up to, for the line under their name tag and in the sidebar: whatever they have
 * open ("💻 in Pixel's terminal", "🔀 reading PR #12"), else somewhere worth saying they are ("🌇 on
 * the balcony", "🛋️ on the couch", "🏎️ driving the Orange Lambo"). Nothing while they're just walking around
 * the office.
 */
export function whereabouts(p: PeerInfo): string | undefined {
  if (p.doing) return p.doing;
  // Not standing anywhere: in on the 2D view, from a phone, say.
  if (p.lite) return uiText('📱 on the 2D view');
  const place = p.seat ? seatAt(p.seat) : undefined;
  const seat = place && SEATING_BY_ID.get(place.seatId);
  if (seat) {
    // "🛋️ Couch" -> "🛋️ on the couch".
    const [icon, ...name] = seat.label.split(' ');
    return uiText`${icon} on the ${name.join(' ').toLowerCase()}`;
  }
  // The roof is the office's size, but none of its rooms are up there.
  if (p.floor === SERVER_ROOM) return uiText('🗄️ in the server room');
  if (p.floor === ROOF) return uiText('🤝 in the meeting room');
  // Through the north wall in the back office: nobody gets there unless the floor's built out.
  if (p.y > -1 && inWing(p.x, p.z, WING.rows)) return uiText('🏗️ in the back office');
  // Down on the street, or out the back door on the stairs down to it.
  if (p.y < -1 || p.x < FLOOR.minX || p.x > FLOOR.maxX || p.z < FLOOR.minZ) return uiText('🚶 outside');
  if (p.z > FLOOR.maxZ) return p.x >= BALCONY.minX && p.x <= BALCONY.maxX ? uiText('🌇 on the balcony') : uiText('🚶 outside');
  if (p.y > LOFT.y - 0.5 && p.x > LOFT.minX && p.z > LOFT.minZ) return uiText("👔 in the boss's office");
  if (p.x > MEETING_ROOM.minX && p.z > MEETING_ROOM.minZ) return uiText('🤝 in the meeting room');
  return undefined;
}
