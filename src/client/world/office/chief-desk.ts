import * as THREE from 'three';
import { CHIEF_DESK } from '../../../shared/layout';
import type { DeskView } from '../types';

/** Adapt the delivered desk and chair without changing the Blender source. */
export function chiefDesk(base: THREE.Object3D): DeskView {
  const chair = base.getObjectByName('boss-chair') as THREE.Group;
  if (!chair?.parent) throw Error('Office model is missing the chief chair');
  delete chair.userData.interazione;
  const group = chair.parent as THREE.Group;
  group.name = CHIEF_DESK.id;
  // Replace the decorative screen with a UV-correct surface for the live terminal.
  const decorative = group.getObjectByName('Mesh_329');
  if (!decorative) throw Error('Office model is missing the chief monitor');
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.45),
    new THREE.MeshBasicMaterial({color:'#1b1d2e', toneMapped:false}));
  monitor.name = 'chief-monitor';
  monitor.position.copy(decorative.position);
  monitor.position.z += 0.007;
  decorative.removeFromParent();
  const laptopAnchor = new THREE.Object3D(), seatAnchor = new THREE.Object3D(), stage = new THREE.Object3D();
  laptopAnchor.name = 'chief-laptop-anchor';
  laptopAnchor.position.set(0, 0.82, 0);
  seatAnchor.name = 'chief-seat-anchor';
  seatAnchor.position.set(0, 0.5, 1);
  seatAnchor.rotation.y = Math.PI;
  seatAnchor.scale.setScalar(0.82);
  stage.position.set(0.72, 0.71, 0.18);
  const vacancy = new THREE.Group();
  group.add(monitor, laptopAnchor, seatAnchor, stage, vacancy);
  return {def:CHIEF_DESK, group, chair, monitor, laptopAnchor, seatAnchor, stage, vacancy, vacancyY:1.33};
}
