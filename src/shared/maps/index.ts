import { t as uiText } from '../i18n.js';
import { BEANBAGS, BOARDS, DESKS, ELEVATOR, ELEVATOR_CAR, EXIT_DOOR, FLOOR, MEETING_SEATS, SEATING, STATIONS, WALL_HEIGHT, WING_DESKS, seatHere, seatPlace, type DeskDef, type SeatPlace } from '../layout.js';
import { BOARD_KEYS, type BoardKey, type BoardDef, type MapPlan } from './types.js';

export * from './types.js';

/** The building always uses the office layout. */
export const OFFICE_MAP = 'office';

/** Desks in the main room and every row the back office can contain. */
const MAP_DESKS: DeskDef[] = [...DESKS, ...WING_DESKS];

function officePlan(): MapPlan {
  const byId = new Map([...MAP_DESKS, ...BEANBAGS, ...STATIONS, ...MEETING_SEATS].map((d) => [d.id, d]));
  const boards = {} as Record<BoardKey, BoardDef>;
  for (const k of BOARD_KEYS) boards[k] = { ...BOARDS[k] };
  return {
    id: OFFICE_MAP,
    name: uiText('Office'),
    icon: '🏢',
    description: uiText('The office: desks, a lounge, the boss’s loft upstairs, a floor for every project, and a shared meeting room on the roof.'),
    style: 'office',
    bounds: { ...FLOOR },
    height: WALL_HEIGHT,
    spawn: { x: ELEVATOR.x, y: 0, z: (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2, rotY: 0 },
    desks: MAP_DESKS,
    overflow: BEANBAGS,
    stations: STATIONS,
    meeting: MEETING_SEATS,
    byId,
    seating: SEATING,
    seatingById: new Map(SEATING.map((s) => [s.id, s])),
    door: { x: FLOOR.minX + 0.45, z: EXIT_DOOR.u },
    boards,
  };
}

export const OFFICE_PLAN: MapPlan = officePlan();

/** The place a peer's `seat` names on `plan` (see seatAt), or undefined if there's no such place. */
export function seatOn(plan: MapPlan, key: string): SeatPlace | undefined {
  const m = /^([\w-]+):(\d+)$/.exec(key);
  const seat = m ? plan.seatingById.get(m[1]) : undefined;
  const i = Number(m?.[2]);
  return seat && i < seat.places.length ? seatPlace(seat, i) : undefined;
}

/** Validates a floor or rooftop seat against the office's fixed layout. */
export function seatHereOn(_plan: MapPlan, key: string, onRoof: boolean | string): SeatPlace | undefined {
  return seatHere(key, onRoof);
}
