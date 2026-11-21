import { ELEVATOR, ELEVATOR_FRONT } from './layout.js';
import { LOBBY, SERVER_ROOM } from './rooftop.js';

// The second flight ends on the delivered landing, x [-12.95, -10.25], z [-4.30, -2.95].
export const LOBBY_GATE = { x: -11.6, y: 5.2, z: -3.55, halfWidth: 1.35 };
export const UPPER_GATE = { x: ELEVATOR.x + 2.35, y: 0, z: ELEVATOR_FRONT - 0.25, halfWidth: 0.78 };

export function stairNeighbor(from: string | null | undefined, firstOffice?: string) {
  const upper = firstOffice ?? SERVER_ROOM;
  return from === LOBBY ? upper : from === upper ? LOBBY : null;
}

/** On the walkable side of the threshold, looking away from it. */
export function stairArrival(floor: string) {
  const lobby = floor === LOBBY;
  const gate = lobby ? LOBBY_GATE : UPPER_GATE;
  return { x: gate.x, y: gate.y, z: gate.z + (lobby ? -0.55 : 0.95), rotY: lobby ? Math.PI : 0 };
}

type Point = { x: number; y: number; z: number };

/** Cross the threshold toward the next floor. Standing still, crossing underneath or teleporting is not a step. */
export function crossedStairs(lobby: boolean, before: Point, now: Point) {
  const gate = lobby ? LOBBY_GATE : UPPER_GATE;
  if (lobby ? before.z >= gate.z || now.z < gate.z : before.z <= gate.z || now.z > gate.z) return false;
  if (Math.abs(now.y - gate.y) > 0.12 || Math.abs(before.y - gate.y) > 0.12 ||
      Math.hypot(now.x - before.x, now.z - before.z) > 0.9) return false;
  const x = before.x + (now.x - before.x) * (gate.z - before.z) / (now.z - before.z);
  return Math.abs(x - gate.x) <= gate.halfWidth;
}
