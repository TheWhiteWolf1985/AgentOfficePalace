import * as THREE from 'three';
import { model, paintModel, palette } from './models';
import type { Collider} from './types';
import type { Fixture } from './office/fixture';

export interface Kitchen {
  group: THREE.Group;
  colliders: Collider[];
}

/** Every material in kitchen.glb by name: the old code-built kitchen's colors, and the office's wood for the top. */
const COLORS: Record<string, string> = {
  Cabinet: '#8ecae6',
  Wood: '#c98b5a',
  Chrome: '#adb5bd',
  Dark: '#343a40',
  Fridge: '#f8f9fa',
  Note: '#ffd166',
  Memo: '#bde0fe',
  Red: '#ef476f',
};

export function buildKitchen(): Kitchen {
  const group = new THREE.Group();
  const kitchen = model('kitchen');
  if (kitchen) {
    const paint = palette(COLORS);
    paintModel(kitchen.scene, paint);
    group.add(kitchen.scene);
  }
  // Modelled facing +z like everything else; against the south wall it turns round to face into the
  group.position.set(-14.5, 0, 12.2);
  group.rotation.y = Math.PI;
  const colliders: Collider[] = [
    { minX: -17, maxX: -12, minZ: 11.7, maxZ: 12.7, top: 1.03 },
    { minX: -11.85, maxX: -10.75, minZ: 11.7, maxZ: 12.7, top: 2.2 },
  ];
  return { group, colliders };
}

/** The kitchen corner: the counter and the fridge. */
export const kitchen: Fixture = (site) => {
  const built = buildKitchen();
  // Counter and fridge, in front of the south wall.
  site.wall('south', -14.5, 0.55, 5.1, 1.1);
  site.wall('south', -11.3, 1.1, 1.1, 2.2);
  return { group: built.group, colliders: built.colliders };
};
