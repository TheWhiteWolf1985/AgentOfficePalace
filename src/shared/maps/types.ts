import type { DeskDef, SeatDef } from '../layout.js';
import type { Bounds } from '../nav.js';

export type BoardKey = 'issues' | 'queue' | 'pulls' | 'services';
export const BOARD_KEYS: readonly BoardKey[] = ['issues', 'queue', 'pulls', 'services'];

/** Position and dimensions of an office board. */
export interface BoardDef {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
  label: string;
}

/** The fixed office layout shared by movement, presence and worker views. */
export interface MapPlan {
  id: 'office';
  name: string;
  icon: string;
  description: string;
  style: 'office';
  bounds: Bounds;
  height: number;
  spawn: { x: number; y: number; z: number; rotY: number };
  desks: DeskDef[];
  overflow: DeskDef[];
  stations: DeskDef[];
  meeting: DeskDef[];
  byId: Map<string, DeskDef>;
  seating: SeatDef[];
  seatingById: Map<string, SeatDef>;
  door: { x: number; z: number };
  boards: Record<BoardKey, BoardDef>;
}

/** Position and facing of a seat or standing spot. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  rotY: number;
}
