import * as THREE from 'three';
import { CONFERENCE_DATA } from '../../shared/conference-room';
import type { WhiteboardSurface } from '../features/whiteboard/surface';
import type { Interactable } from './types';

/** Bind only the delivered writing surface. The frame, glazing, geometry and colliders stay intact. */
export function bindConferenceWhiteboard(room: THREE.Object3D, display: WhiteboardSurface) {
  const face = room.getObjectByName(CONFERENCE_DATA.whiteboard.surface_node);
  if (!(face instanceof THREE.Mesh)) throw new Error('The meeting room writing surface is unavailable');
  room.updateMatrixWorld(true);
  face.geometry.computeBoundingBox();
  const center = face.localToWorld(face.geometry.boundingBox!.getCenter(new THREE.Vector3()));
  const normals = face.geometry.getAttribute('normal');
  const normal = new THREE.Vector3().fromBufferAttribute(normals, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(face.matrixWorld));
  const stand = center.clone().addScaledVector(normal, 1.7);
  const interactable: Interactable = { kind: 'whiteboard', x: stand.x, z: stand.z, radius: 2.3 };
  display.material.map!.flipY = false; // glTF UVs: top V=0. Office PlaneGeometry keeps its own orientation.
  display.material.name = CONFERENCE_DATA.whiteboard.material;
  face.material = display.material;
  face.castShadow = face.receiveShadow = false;
  face.userData.interact = interactable;
  return { ...display, interactable };
}
