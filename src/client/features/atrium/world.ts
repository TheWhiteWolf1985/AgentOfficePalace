import * as THREE from 'three';
import { ATRIUM_COLLIDERS, ATRIUM_DATA, ATRIUM_SEATING } from '../../../shared/atrium';
import { ELEVATOR, FLOOR } from '../../../shared/layout';
import { LOBBY_NAME } from '../../../shared/rooftop';
import { prepareAtrium } from '../../world/atrium-materials';
import { buildReceptionStaff } from '../../world/character/reception-staff';
import { buildCity } from '../../world/city';
import { buildElevator } from '../../world/elevator';
import { model } from '../../world/models';
import type { NightParts } from '../../world/outside';
import type { Collider, Interactable } from '../../world/types';

export function buildAtrium(night: NightParts) {
  const asset = model('atrium');
  if (!asset) throw new Error('The atrium model is unavailable');
  const group = new THREE.Group();
  group.name = 'atrium';
  prepareAtrium(asset.scene);
  group.add(asset.scene);
  group.add(buildReceptionStaff(name => model(name)?.scene ?? null));
  const colliders: Collider[] = ATRIUM_COLLIDERS.map((c) => ({ ...c }));
  colliders.push({ minX: ELEVATOR.x-ELEVATOR.width/2, maxX: ELEVATOR.x+ELEVATOR.width/2, minZ: FLOOR.minZ, maxZ: FLOOR.minZ+ELEVATOR.depth, bottom: -0.3, top: 0 });
  const elevator = buildElevator(ATRIUM_DATA.height);
  elevator.setSign(LOBBY_NAME);
  group.add(elevator.group);
  colliders.push(...elevator.colliders);
  const interactables: Interactable[] = [elevator.interactable];
  const sign = asset.scene.getObjectByName(ATRIUM_DATA.logo.surface);
  const counter = ATRIUM_COLLIDERS.find(c=>c.id==='atrio_reception_body');
  const signInteraction: Interactable = {kind:'reception',x:0,y:0,z:(counter?.maxZ ?? -7.3)+1.6,radius:2.6};
  if(sign){sign.userData.interact=signInteraction;interactables.push(signInteraction);}
  const targets = new THREE.Group();
  for (const seat of ATRIUM_SEATING) {
    const it: Interactable = { kind: 'seat', seatId: seat.id, x: seat.x, y: 0, z: seat.z, radius: 1.7 };
    interactables.push(it);
    const target = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 1.7), new THREE.MeshBasicMaterial({ visible: false }));
    target.position.set(seat.x, seat.hips, seat.z);
    target.userData.interact = it;
    targets.add(target);
  }
  group.add(targets);
  const city = buildCity(night);
  group.add(city.group, new THREE.AmbientLight('#fff2dc', 1.4));
  return { group, colliders, interactables, elevator, city, pickables: [asset.scene, elevator.group, targets] };
}
