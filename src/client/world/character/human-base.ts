import * as THREE from 'three';
import type { PersonRig } from './rig';
import { toonUnique } from '../toon';

/** Adapt one model clone to the procedural controller. Its cached geometry remains shared. */
export function humanBase(asset: THREE.Object3D) {
  const find = (name: string) => {
    const node = asset.getObjectByName(name);
    if (!node) throw new Error(`human_base: missing ${name}`);
    return node;
  };
  // glTF Empty nodes may be Object3D rather than Group. Preserve their transforms and children.
  const group = (name: string) => {
    const source = find(name);
    if (source instanceof THREE.Group) return source;
    const result = new THREE.Group().copy(source, false);
    result.add(...source.children.slice());
    source.parent?.add(result);
    source.removeFromParent();
    return result;
  };
  const root = group('char_root'), body = group('char_body'), head = group('char_head');
  const rig: PersonRig = {
    root, body, head, torso: find('char_torso'),
    armL: find('char_arm_negx'), armR: find('char_arm_posx'),
    legL: find('char_leg_negx'), legR: find('char_leg_posx'),
  };
  if (body.parent !== root || [rig.torso, head, rig.armL, rig.armR, rig.legL, rig.legR].some(n => n.parent !== body)) {
    throw new Error('human_base: incompatible rig hierarchy');
  }
  const materials = new Map<THREE.Material, THREE.MeshToonMaterial>();
  root.traverse(node => {
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
    node.userData.sharedHumanGeometry = true;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const material = (name: string) => {
    const result = [...materials.values()].find(m => m.name === name);
    if (!result) throw new Error(`human_base: missing material ${name}`);
    return result;
  };
  return {
    rig, skin: material('char_mat_skin'), clothing: material('char_mat_clothing'), hair: material('char_mat_hair'),
    dispose: () => { for (const m of materials.values()) m.dispose(); },
  };
}
