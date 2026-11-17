import * as THREE from 'three';
import { STREET_Y } from '../../shared/layout';
import type { NightParts } from './outside';
import { toonUnique } from './toon';

/** Lighting state exists independently of the project floor's geometry. */
export function createNightParts(): NightParts {
  return { bulbs: [], halos: [], lamps: [], windows: [], street: STREET_Y, clouds: toonUnique('#ffffff'), wetGlass: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, visible: false }), glows: [] };
}
