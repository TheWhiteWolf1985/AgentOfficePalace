import { EXIT_STAIRS, FLOOR, ROAD, WALL_T, WING, wingMinZ } from './layout.js';

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; }
export const BUILDING: Box = { minX: FLOOR.minX - WALL_T, maxX: FLOOR.maxX + WALL_T, minZ: FLOOR.minZ - WALL_T, maxZ: FLOOR.maxZ + WALL_T };

/** Four non-overlapping strips between two nested rectangles. */
export function boxRing(outer: Box, inner: Box): Box[] {
  return [
    { minX: outer.minX, maxX: outer.maxX, minZ: outer.minZ, maxZ: inner.minZ },
    { minX: outer.minX, maxX: outer.maxX, minZ: inner.maxZ, maxZ: outer.maxZ },
    { minX: outer.minX, maxX: inner.minX, minZ: inner.minZ, maxZ: inner.maxZ },
    { minX: inner.maxX, maxX: outer.maxX, minZ: inner.minZ, maxZ: inner.maxZ },
  ];
}
export function inset(b: Box, amount: number): Box {
  return { minX: b.minX + amount, maxX: b.maxX - amount, minZ: b.minZ + amount, maxZ: b.maxZ - amount };
}

/** Leave space for the full back office, balcony and exit stairs, even before offices exist. */
export const ROAD_INNER: Box = { minX: -29, maxX: 29, minZ: wingMinZ(WING.rows) - WALL_T - 4.5, maxZ: ROAD.minZ };
export const ROAD_OUTER = inset(ROAD_INNER, -8);
export const CAMPUS_ROAD = boxRing(ROAD_OUTER, ROAD_INNER);
export const CAMPUS_SIDEWALKS = [...boxRing(ROAD_INNER, inset(ROAD_INNER, 2)), ...boxRing(inset(ROAD_OUTER, -2), ROAD_OUTER)];
/** The pedestrian route from the exit stairs and the atrium frontage to the near sidewalk. */
export const CAMPUS_PATHS: Box[] = [
  { minX: EXIT_STAIRS.minX - 1, maxX: BUILDING.maxX + 2, minZ: BUILDING.maxZ, maxZ: ROAD.minZ - 2 },
  { minX: EXIT_STAIRS.minX - 1, maxX: BUILDING.minX, minZ: BUILDING.minZ, maxZ: BUILDING.maxZ },
];

/** The same compact pedestrian boundary is enforced by the client and server. */
export const GROUNDS = inset(ROAD_OUTER, -5);
export function onGrounds(x: number, z: number): boolean {
  return x > GROUNDS.minX && x < GROUNDS.maxX && z > GROUNDS.minZ && z < GROUNDS.maxZ;
}
export const PAVEMENT: Box[] = [BUILDING, ...CAMPUS_ROAD, ...CAMPUS_SIDEWALKS, ...CAMPUS_PATHS];

/** A small, deterministic planting plan shared by all views of the company. */
export const CAMPUS_TREES = [
  { x: -24, z: -19, scale: 1 },
  { x: 24, z: -19, scale: 1.05 },
  { x: -24, z: 19, scale: 1 },
  { x: 24, z: 19, scale: 0.95 },
] as const;
