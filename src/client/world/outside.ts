import * as THREE from 'three';
import { boxRing, CAMPUS_PATHS, CAMPUS_ROAD, CAMPUS_SIDEWALKS, CAMPUS_TREES, GROUNDS, inset, ROAD_INNER, ROAD_OUTER, type Box } from '../../shared/ground';
import { STREET_Y } from '../../shared/layout';
import type { Collider } from './types';
import type { Fixture, StreetSite } from './office/fixture';
import { exteriorGroundGeometry } from './exterior-ground';
import { mergeByMaterial, mesh, toon, toonUnique } from './toon';

/** A light that throws a pool of light around it at night (see sky.ts): where, how far, and its color. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  reach: number;
  color: string;
  /** How bright, at the middle of the pool. */
  power: number;
  /** Down by the street (a street lamp, the one over the exit): it's further down the higher your floor is. */
  ground?: boolean;
}

/** Everything that changes between day and night and with the weather, for the sky to drive. */
export interface NightParts {
  /** Bulbs whose glow goes from `day` (emissive intensity by day) up to full at night. */
  bulbs: { mat: THREE.MeshToonMaterial; day: number }[];
  /** Where each bulb's soft halo goes at night, and its color; `ground` as for a Lamp. */
  halos: { at: THREE.Vector3; size: number; color: string; ground?: boolean }[];
  lamps: Lamp[];
  /** How far below the floor you're on the street is (see streetBelow): what the `ground` lamps drop with. */
  street: number;
  /** The company's exterior windows, lit at night. */
  windows: THREE.MeshToonMaterial[];
  clouds: THREE.MeshToonMaterial;
  /** Rain running down the office windows. */
  wetGlass: THREE.MeshBasicMaterial;
  /** Decorative light visible only at night, at most `max` opaque. */
  glows: { mat: THREE.Material; max: number }[];
}

/** A bulb that glows `day` much by day and fully at night. */
export function bulb(night: NightParts, color: string, day = 0): THREE.MeshToonMaterial {
  const mat = toonUnique(color);
  mat.emissive.set(color);
  mat.emissiveIntensity = day;
  night.bulbs.push({ mat, day });
  return mat;
}

export function tree(scale: number): THREE.Group {
  const t = new THREE.Group();
  t.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 8), toon('#8a5a3b'), 0, 1.1, 0));
  t.add(mesh(new THREE.SphereGeometry(1.6, 12, 10), toon('#5fb760'), 0, 3.2, 0));
  t.add(mesh(new THREE.SphereGeometry(1.1, 12, 10), toon('#3f8f45'), 0.8, 3.9, 0.4));
  t.add(mesh(new THREE.SphereGeometry(1.0, 12, 10), toon('#6fcf6a'), -0.7, 3.8, -0.3));
  t.scale.setScalar(scale);
  return t;
}

/** A paved rectangle, expressed in the same coordinates as collision and footsteps. */
function surface(b: Box, y: number, material: THREE.Material): THREE.Mesh {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ), material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set((b.minX + b.maxX) / 2, y, (b.minZ + b.maxZ) / 2);
  plane.receiveShadow = true;
  return plane;
}

/** The company lot, with one perimeter road and four trees; no neighbouring city or parking. */
export function buildCompanyGround() {
  const group = new THREE.Group();
  group.name = 'company-grounds';
  // A single plain background surface reaches the weather's haze, avoiding a floating island.
  // Its area adds no subdivisions or scenery; the walkable lot is only GROUNDS.
  const grass = new THREE.Mesh(exteriorGroundGeometry({ minX: -320, maxX: 320, minZ: -320, maxZ: 320 }), toon('#a7d98b'));
  grass.name = 'company-grass';
  grass.position.y = -0.03;
  grass.receiveShadow = true;
  group.add(grass);
  const paved = new THREE.Group();
  for (const b of CAMPUS_PATHS) paved.add(surface(b, 0.012, toon('#d8d2c5')));
  for (const b of CAMPUS_SIDEWALKS) paved.add(surface(b, 0.02, toon('#e3ddd0')));
  for (const b of CAMPUS_ROAD) paved.add(surface(b, 0.004, toon('#717983')));
  const paint = toon('#f4edda');
  for (const b of [...boxRing(inset(ROAD_OUTER, 0.3), inset(ROAD_OUTER, 0.38)), ...boxRing(inset(ROAD_INNER, -0.38), inset(ROAD_INNER, -0.3))]) {
    paved.add(surface(b, 0.006, paint));
  }
  for (const b of CAMPUS_ROAD) {
    const horizontal = b.maxX - b.minX > b.maxZ - b.minZ;
    const start = horizontal ? b.minX : b.minZ;
    const end = horizontal ? b.maxX : b.maxZ;
    for (let at = start + 2; at + 3 < end - 1; at += 8) {
      const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
      paved.add(surface(horizontal ? { minX: at, maxX: at + 3, minZ: z - 0.06, maxZ: z + 0.06 } : { minX: x - 0.06, maxX: x + 0.06, minZ: at, maxZ: at + 3 }, 0.007, paint));
    }
  }
  const paving = mergeByMaterial(paved);
  paving.name = 'company-paving';
  group.add(paving);
  const colliders: Collider[] = [{ ...GROUNDS, bottom: -1, top: 0 }];
  // Keep the small pedestrian perimeter closed, including below the surface and after a jump.
  for (const x of [GROUNDS.minX, GROUNDS.maxX]) colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: GROUNDS.minZ, maxZ: GROUNDS.maxZ, bottom: -1, top: 99, fence: true });
  for (const z of [GROUNDS.minZ, GROUNDS.maxZ]) colliders.push({ minX: GROUNDS.minX, maxX: GROUNDS.maxX, minZ: z - 0.15, maxZ: z + 0.15, bottom: -1, top: 99, fence: true });
  const forest = new THREE.Group();
  for (const { x, z, scale } of CAMPUS_TREES) {
    const t = tree(scale);
    t.position.set(x, 0, z);
    forest.add(t);
    const r = 0.3 * scale;
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, bottom: 0, top: 2.2 * scale });
  }
  const trees = mergeByMaterial(forest);
  trees.name = 'company-trees';
  group.add(trees);
  return { group, colliders };
}

/** A few weather-tinted clouds, shared in layout by every view of the building. */
export function buildCompanyClouds(night: NightParts): THREE.Group {
  const parts = new THREE.Group();
  for (const [x, y, z] of [[-80, 54, -70], [95, 62, 10], [-15, 58, 110]]) {
    for (const [dx, dy, radius] of [[0, 0, 8], [8, -1, 6], [-7, -1, 5.5]]) {
      const puff = mesh(new THREE.SphereGeometry(radius, 10, 8), night.clouds, x + dx, y + dy, z, false);
      puff.scale.y = 0.65;
      parts.add(puff);
    }
  }
  const clouds = mergeByMaterial(parts);
  clouds.name = 'company-clouds';
  return clouds;
}

/** The office's view of the lot, including clouds at a fixed height above the street. */
export const street: Fixture<never, StreetSite> = (site) => {
  const ground = buildCompanyGround();
  ground.group.position.y = STREET_Y;
  site.ground.add(ground.group);
  site.groundColliders.push(...ground.colliders.map(c => ({ ...c, bottom: (c.bottom ?? 0) + STREET_Y, top: c.top > 50 ? c.top : c.top + STREET_Y })));
  ground.group.add(buildCompanyClouds(site.get('night')));
  return {};
};
