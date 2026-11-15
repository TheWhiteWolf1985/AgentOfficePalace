import { FLOOR, ROAD, WALL_T } from './layout.js';

/** The street ends at pedestrian barriers; there is no route beyond them. */
export const STREET_END = 110;
export const GROUNDS = { minX: -STREET_END, maxX: STREET_END, minZ: -70, maxZ: 70 } as const;
export function onGrounds(x: number, z: number): boolean {
  return x > GROUNDS.minX && x < GROUNDS.maxX && z > GROUNDS.minZ && z < GROUNDS.maxZ;
}
const B = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; }
export const LOT: Box = { minX: -30, maxX: 30, minZ: B.maxZ, maxZ: 21 };
export const SIDE_LOT: Box = { minX: B.maxX, maxX: B.maxX + 12, minZ: B.minZ - 2, maxZ: B.maxZ + 4 };
/** Paved surfaces around and under the office, used by footsteps. */
export const PAVEMENT: Box[] = [
  { minX: FLOOR.minX, maxX: B.maxX, minZ: FLOOR.minZ, maxZ: B.maxZ },
  { ...LOT, maxZ: ROAD.minZ }, SIDE_LOT,
  { minX: -STREET_END, maxX: STREET_END, minZ: ROAD.minZ, maxZ: ROAD.maxZ },
];
