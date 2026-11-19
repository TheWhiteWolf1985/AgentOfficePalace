import * as THREE from 'three';
import { toonUnique } from './toon';

/** Preserve the delivered colors, transparency, emissive details and UVs in the application's renderer. */
export function prepareServerRoom(root: THREE.Object3D) {
  const painted = new Map<THREE.Material, THREE.MeshToonMaterial>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const paint = (source: THREE.MeshStandardMaterial) => {
      let material = painted.get(source);
      if (!material) {
        material = toonUnique(source.color);
        material.name = source.name;
        material.emissive.copy(source.emissive);
        material.emissiveIntensity = source.emissiveIntensity;
        material.map = source.map;
        material.transparent = source.transparent;
        material.opacity = source.opacity;
        material.side = source.side;
        material.depthWrite = !source.transparent;
        if (source.transparent) material.userData.outlineParameters = { visible: false };
        painted.set(source, material);
      }
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
    node.castShadow = !(Array.isArray(node.material) ? node.material : [node.material]).some(m => m.transparent);
    node.receiveShadow = true;
  });
}
