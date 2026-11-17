/** The shared meeting room delivered in Blender, in application Y-up coordinates. */
import * as THREE from 'three';
import { CONFERENCE_COLLIDERS, CONFERENCE_DATA, CONFERENCE_SEATING } from '../../../shared/conference-room';
import { ELEVATOR, FLOOR } from '../../../shared/layout';
import { ROOF_NAME } from '../../../shared/rooftop';
import { buildCity, type City } from '../../world/city';
import { buildElevator, type Elevator } from '../../world/elevator';
import { model } from '../../world/models';
import { applyConferenceGlazing } from '../../world/conference-glazing';
import { bindConferenceWhiteboard } from '../../world/conference-whiteboard';
import { createWhiteboardSurface } from '../whiteboard/surface';
import type { NightParts } from '../../world/outside';
import { toonUnique } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';

export interface Rooftop {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  elevator: Elevator;
  city: City;
  pickables: THREE.Object3D[];
  whiteboard: ReturnType<typeof bindConferenceWhiteboard>;
  setFloors(floors: number, wings?: readonly number[]): void;
  update(t: number, dt: number, dark: number, people: Iterable<{ x: number; y: number; z: number }>): void;
}

export function buildRooftop(night: NightParts): Rooftop {
  const room = model('conference_room');
  if (!room) throw new Error('The meeting room model is unavailable');
  const group = new THREE.Group();
  group.name = 'conference-room';
  group.add(room.scene);

  // Keep the supplied linear colors, glazing and UVs. Only the material model becomes toon.
  const painted = new Map<string, THREE.MeshToonMaterial>();
  room.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const paint = (source: THREE.MeshStandardMaterial) => {
      let mat = painted.get(source.name);
      if (!mat) {
        mat = toonUnique(source.color);
        mat.name = source.name;
        mat.emissive.copy(source.emissive);
        mat.transparent = source.transparent;
        mat.opacity = source.opacity;
        mat.side = source.side;
        mat.depthWrite = !mat.transparent;
        painted.set(source.name, mat);
      }
      return mat;
    };
    node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
    node.castShadow = !(node.material as THREE.Material).transparent;
    node.receiveShadow = true;
  });
  applyConferenceGlazing(room.scene);
  const whiteboard = bindConferenceWhiteboard(room.scene, createWhiteboardSurface(CONFERENCE_DATA.whiteboard.width_m, CONFERENCE_DATA.whiteboard.height_m, 2048, true));

  const colliders: Collider[] = CONFERENCE_COLLIDERS.map((c) => ({ ...c }));
  // The asset deliberately reserves this volume for the application's own elevator.
  colliders.push({ minX: ELEVATOR.x - ELEVATOR.width / 2, maxX: ELEVATOR.x + ELEVATOR.width / 2, minZ: FLOOR.minZ, maxZ: FLOOR.minZ + ELEVATOR.depth, bottom: -0.3, top: 0 });
  const elevator = buildElevator(CONFERENCE_DATA.height);
  elevator.setSign(ROOF_NAME);
  group.add(elevator.group);
  colliders.push(...elevator.colliders);
  const interactables: Interactable[] = [elevator.interactable, whiteboard.interactable];
  const seatTargets = new THREE.Group();
  group.add(seatTargets);
  for (const seat of CONFERENCE_SEATING) {
    const definition = CONFERENCE_DATA.seats.find((s) => s.id === seat.id)!;
    const it: Interactable = { kind: 'seat', seatId: seat.id, x: seat.x, y: seat.y, z: seat.z, radius: 1 };
    interactables.push(it);
    // A sofa has several places: attach each interaction to its individual seat anchor.
    const anchor = room.scene.getObjectByName(seat.id);
    if (anchor) {
      const target = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.7, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
      target.position.set(seat.x, definition.position.y, seat.z);
      target.userData.interact = it;
      seatTargets.add(target);
    }
    const chair = room.scene.getObjectByName(definition.chair);
    if (chair && definition.role !== 'lounge') chair.traverse((n) => { n.userData.interact = it; });
  }

  const city = buildCity(night);
  group.add(city.group);
  // Interior lights stay useful at night, without animated DJ lights.
  group.add(new THREE.AmbientLight('#fff2dc', 1.4));
  const door = room.scene.getObjectByName(CONFERENCE_DATA.door.door_pivot);
  const doorIndex = CONFERENCE_COLLIDERS.findIndex((c) => c.role === 'door_closed');
  const doorCollider = colliders[doorIndex];
  const closedTop = doorCollider.top;
  let open = 0;
  let hold = 0;
  const update = (t: number, dt: number, dark: number, people: Iterable<{ x: number; y: number; z: number }>) => {
    elevator.update(dt);
    city.update(t, dt, dark);
    const nearby = [...people].some((p) => p.y < 2 && Math.abs(p.x - CONFERENCE_DATA.door.axis_x_m) < 2.3 && Math.abs(p.z) < 2.5);
    hold = nearby ? 1.8 : Math.max(0, hold - dt);
    open += ((hold > 0 ? 1 : 0) - open) * (1 - Math.exp(-dt * 8));
    if (door) door.rotation.y = open * Math.PI / 2;
    // Keep the passage solid until the leaf clears it; hold it open while anyone crosses.
    doorCollider.top = open > 0.8 ? -10 : closedTop;
  };
  return { group, colliders, interactables, elevator, city, whiteboard, pickables: [room.scene, elevator.group, seatTargets], setFloors: (n, wings) => city.setFloors(Math.max(0, n), wings), update };
}
