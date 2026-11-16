import * as THREE from 'three';
import { GLASS } from './office/materials';
import { toonUnique } from './toon';

/** Adapt only runtime materials; the delivered logo surface, colors and geometry stay intact. */
export function prepareAtrium(root: THREE.Object3D) {
  const painted = new Map<string, THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const paint = (source: THREE.MeshStandardMaterial) => {
      let mat = painted.get(source.name);
      if (!mat) {
        if (source.name === 'atrio_mat_glass') {
          mat = GLASS.clone();
          mat.side = THREE.FrontSide;
        } else {
          const toon = toonUnique(source.color);
          toon.emissive.copy(source.emissive);
          toon.emissiveIntensity = source.emissiveIntensity;
          toon.side = source.side;
          mat = toon;
        }
        mat.name = source.name;
        painted.set(source.name, mat);
      }
      return mat;
    };
    node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    node.castShadow = !mats.some((m) => m.transparent);
    node.receiveShadow = true;
  });
}
