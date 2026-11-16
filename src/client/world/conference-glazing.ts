import * as THREE from 'three';
import { GLASS } from './office/materials';

// The Blender preview uses solid blue window panels. Give them the same real glass as the office.
const pane = GLASS.clone();
pane.name = 'mat_glass_blue';
// These panes are closed boxes, rather than the office's sheets: draw the facing side once.
pane.side = THREE.FrontSide;
const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false });
shine.name = 'mat_glass_reflection';
for (const mat of [pane, shine]) mat.userData.outlineParameters = { visible: false };

/** Shared by the walkable room and its exterior representation above the office floors. */
export function applyConferenceGlazing(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const glazing = (mat: THREE.Material) => mat.name === pane.name ? pane : mat.name === shine.name ? shine : mat;
    const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(glazing);
    node.material = Array.isArray(node.material) ? materials : materials[0];
    if (materials.some((mat) => mat === pane || mat === shine)) node.castShadow = false;
  });
}
