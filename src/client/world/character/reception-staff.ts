import * as THREE from 'three';
import { RECEPTION_STAFF } from '../../../shared/reception-staff';
import { toonUnique } from '../toon';

type ReceptionModel = (typeof RECEPTION_STAFF)[number]['model'];

/** Decorative actors only: no Person/Worker, session, task, seat or interaction is registered. */
export function buildReceptionStaff(load: (name: ReceptionModel) => THREE.Object3D | null) {
  const group = new THREE.Group();
  group.name = 'reception-staff';
  for (const slot of RECEPTION_STAFF) {
    const actor = load(slot.model);
    if (!actor) continue; // Model preload already reports an unavailable asset.
    const materials = new Map<THREE.Material, THREE.MeshToonMaterial>();
    actor.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const paint = (source: THREE.MeshStandardMaterial) => {
        let material = materials.get(source);
        if (!material) {
          material = toonUnique(source.color);
          material.name = source.name;
          material.emissive.copy(source.emissive);
          material.emissiveIntensity = source.emissiveIntensity;
          material.side = source.side;
          materials.set(source, material);
        }
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
      node.castShadow = true;
      node.receiveShadow = true;
    });
    actor.name = slot.id;
    actor.position.set(slot.position.x, slot.position.y, slot.position.z);
    actor.rotation.y = slot.rotY;
    actor.scale.setScalar(slot.scale);
    group.add(actor);
  }
  return group;
}
