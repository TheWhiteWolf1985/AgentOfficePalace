import * as THREE from 'three';
import { SERVER_ROOM_COLLIDERS, SERVER_ROOM_DATA, SERVER_ROOM_SEATING } from '../../../shared/server-room';
import { ELEVATOR, FLOOR } from '../../../shared/layout';
import { SERVER_ROOM_NAME } from '../../../shared/rooftop';
import { buildCompanyExterior } from '../../world/company-exterior';
import { buildElevator } from '../../world/elevator';
import { model } from '../../world/models';
import { prepareServerRoom } from '../../world/server-room-materials';
import { batchStaticMeshes } from '../../world/static-batches';
import type { NightParts } from '../../world/outside';
import type { Collider, Interactable } from '../../world/types';
import { createServerPanels } from './panels';

export function buildServerRoom(night: NightParts) {
  const room = model('server_room');
  if (!room) throw new Error('The server room model is unavailable');
  const group = new THREE.Group(); group.name = 'server-room';
  prepareServerRoom(room.scene);
  const door = room.scene.getObjectByName(SERVER_ROOM_DATA.door.pivot);
  const preserved = new Set([SERVER_ROOM_DATA.door.pivot, ...SERVER_ROOM_DATA.seats.map(s => s.chair),
    ...SERVER_ROOM_DATA.panels.map(p => p.surface_node), 'server_v12_access_keypad',
    ...[1,2].flatMap(a => [1,2].map(b => `server_v12_ops_screen_${a}_${b}`)),
    ...['01_01','01_02','02_01','02_02','03_01','03_02'].map(id => `server_v12_extractor_${id}_rotor`)]);
  batchStaticMeshes(room.scene, preserved, { staticDoors: true });
  group.add(room.scene);
  room.scene.updateMatrixWorld(true);
  const panels = createServerPanels(room.scene);
  const colliders: Collider[] = SERVER_ROOM_COLLIDERS.map(c => ({ ...c }));
  colliders.push({ minX: ELEVATOR.x-ELEVATOR.width/2, maxX: ELEVATOR.x+ELEVATOR.width/2,
    minZ: FLOOR.minZ, maxZ: FLOOR.minZ+ELEVATOR.depth, bottom: -.3, top: 0 });
  const elevator = buildElevator(SERVER_ROOM_DATA.height); elevator.setSign(SERVER_ROOM_NAME);
  group.add(elevator.group); colliders.push(...elevator.colliders);
  const interactables: Interactable[] = [elevator.interactable,...panels.interactables], targets = new THREE.Group();
  for (const seat of SERVER_ROOM_SEATING) {
    const interaction: Interactable = { kind: 'seat', seatId: seat.id, x: seat.x, y: 0, z: seat.z, radius: 1.5 };
    interactables.push(interaction);
    const target = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.4, .9), new THREE.MeshBasicMaterial({ visible: false }));
    target.position.set(seat.x, seat.hips, seat.z); target.userData.interact = interaction; targets.add(target);
    room.scene.getObjectByName(SERVER_ROOM_DATA.seats.find(s => s.id === seat.id)!.chair)?.traverse(n => { n.userData.interact = interaction; });
  }
  group.add(targets);
  const exterior = buildCompanyExterior(night, 'server');
  group.add(exterior.group, new THREE.AmbientLight('#fff2dc', 1.4));
  const passage = colliders[SERVER_ROOM_COLLIDERS.findIndex(c => c.role === 'access_door')];
  const closedTop = passage.top;
  let open = 0, hold = 0;
  // Navigation is available now; the modeled keypad and monitoring surfaces are not yet wired.
  const update = (dt: number, people: Iterable<{ x: number; y: number; z: number }>) => {
    elevator.update(dt);
    const nearby = [...people].some(p => p.y < 2 && Math.abs(p.x - SERVER_ROOM_DATA.door.hinge.x) < 2.4 && Math.abs(p.z) < 2.2);
    hold = nearby ? 1.8 : Math.max(0, hold-dt);
    open += ((hold > 0 ? 1 : 0)-open) * (1-Math.exp(-dt*8));
    if (door) door.rotation.y = open*SERVER_ROOM_DATA.door.angle;
    passage.top = open > .8 ? -10 : closedTop;
  };
  return { group, colliders, interactables, elevator, exterior, panels, update, pickables: [room.scene, elevator.group, targets] };
}
