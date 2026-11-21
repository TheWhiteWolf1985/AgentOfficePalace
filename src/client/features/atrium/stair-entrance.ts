import * as THREE from 'three';
import { UPPER_GATE } from '../../../shared/atrium-stairs';
import { LOBBY_NAME } from '../../../shared/rooftop';
import { mesh, textPlane, toon } from '../../world/toon';

/** A signed entrance beside the lift on whichever floor currently sits above the atrium. */
export function stairEntrance() {
  const group = new THREE.Group();
  group.name = 'atrium-stair-entrance';
  group.position.set(UPPER_GATE.x, 0, UPPER_GATE.z);
  const width = UPPER_GATE.halfWidth * 2;
  const steel = toon('#45586a');
  const frame = new THREE.BoxGeometry(0.065, 2.12, 0.065);
  for (const side of [-1, 1]) group.add(mesh(frame, steel, side * (width / 2 + 0.06), 1.06, -0.25, false));
  group.add(mesh(new THREE.BoxGeometry(width + 0.2, 0.12, 0.08), steel, 0, 2.1, -0.25, false));
  const sign = textPlane('↓ ' + LOBBY_NAME, { size: 48, bg: '#394a5a', color: '#ffffff' });
  sign.position.set(0, 2.12, -0.19);
  group.add(sign);
  const tread = new THREE.BoxGeometry(width, 0.012, 0.07);
  for (const z of [-0.17, 0, 0.17]) group.add(mesh(tread, steel, 0, 0.017, z, false));
  return group;
}
