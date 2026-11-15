import type * as THREE from 'three';
import type { FloorPalette } from '../../shared/floors';
import { LOFT, WALL_HEIGHT, WALL_T, FLOOR, type DeskDef } from '../../shared/layout';
import { OFFICE_PLAN, type BoardKey, type MapPlan } from '../../shared/maps';
import { officeNav, wayHome, wayIn, wayToBalcony, type NavGrid, type Pt } from '../../shared/nav';
import type { Area } from './confetti';
import type { Gong } from '../features/gong/world';
import type { Collider, DeskView, Interactable, Office } from './types';

/** Paths into and out of an office desk. */
export interface Ways {
  home(seat: DeskDef, from?: Pt): { way: Pt[]; chute: boolean };
  in(seat: DeskDef): Pt[];
}

/** Office resources shared by movement, worker views and the boards. */
export interface World {
  plan: MapPlan;
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  pickables: THREE.Object3D[];
  desks: Map<string, DeskView>;
  boardMeshes: Record<BoardKey, THREE.Mesh>;
  meetingBoard?: THREE.Mesh;
  meetingSign?: THREE.Mesh;
  gong?: Gong;
  nav: NavGrid;
  ways: Ways;
  rain: { area: Area; top: (x: number, z: number) => number }[];
  room: { wall: number; enclosed: boolean };
  setBeanbags(out: Set<string>): Collider[];
  setLook(p: FloorPalette): void;
  setProjectName(name: string): void;
  update(t: number, dt: number, people: Iterable<{ x: number; y: number; z: number }>): void;
}

/** Where confetti rains from over (x, z) downstairs in the office: the ceiling, or under the loft, the underside of its floor. */
function ceilingOver(x: number, z: number): number {
  const loft = x > LOFT.minX && x < LOFT.maxX && z > LOFT.minZ && z < LOFT.maxZ;
  return loft ? LOFT.y - 0.35 : WALL_HEIGHT - 0.1;
}

/**
 * The office as a world. `upstairs` says whether this floor is above the bottom one (no exit door:
 * workers leave by the balcony), and `wing` how many rows its back office is built out (see WING).
 */
export function officeWorld(office: Office, upstairs: () => boolean, wing: () => number): World {
  return {
    plan: OFFICE_PLAN,
    group: office.group,
    colliders: office.colliders,
    interactables: office.interactables,
    pickables: [office.group],
    desks: office.desks,
    boardMeshes: office.boardMeshes,
    meetingBoard: office.meetingBoard,
    meetingSign: office.meetingSign,
    gong: office.gong,
    get nav() {
      return officeNav(wing());
    },
    ways: {
      home: (seat) => (upstairs() ? { way: wayToBalcony(seat, wing()), chute: true } : { way: wayHome(seat, wing()), chute: false }),
      in: (seat) => wayIn(seat, wing()),
    },
    rain: [
      { area: FLOOR, top: ceilingOver },
      { area: LOFT, top: () => LOFT.y + LOFT.height - 0.1 },
    ],
    room: { wall: WALL_T, enclosed: false },
    setBeanbags: (out) => office.setBeanbags(out),
    setLook: (p) => office.setLook(p),
    setProjectName: (name) => office.setProjectName(name),
    update: (t, dt, people) => office.update(t, dt, people),
  };
}
