import * as THREE from 'three';
import type { AgentAppearance } from '../../../shared/agent-appearance';
import { humanBase } from './human-base';
import { HIPS, type WorkerRig } from './rig';

const GLOWING_ROLES = new Set(['eyebrows', 'iris', 'mouth']);

/** Use the human rig's own rest pivots while following the existing worker animation. */
export function agentVisual(asset: THREE.Object3D, hair: THREE.Object3D | null, appearance: AgentAppearance) {
  const visual = humanBase(asset);
  const { rig } = visual;
  visual.setHair(hair);
  for (const [role, color] of Object.entries(appearance.colors)) {
    const material = visual.material('char_mat_' + role);
    material.color.set(color);
    if (GLOWING_ROLES.has(role)) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.35;
    }
  }
  const eyes = ['negx', 'posx'].map(side => rig.head.getObjectByName('char_eye_' + side)!);
  const pupils = ['negx', 'posx'].map(side => rig.head.getObjectByName('char_pupil_' + side)!);
  const status = visual.material('char_mat_status');
  const indicator = rig.root.getObjectByName('char_status')!;
  const eyeScale = eyes.map(eye => eye.scale.y);
  const pupilY = pupils.map(pupil => pupil.position.y);
  const arms = [rig.armL, rig.armR], legs = [rig.legL, rig.legR];
  function pose(worker: WorkerRig, lid: number, seated: boolean, walking: boolean) {
    // The original worker stands on its seat anchor. Align the new model's hips to that anchor.
    rig.root.position.y = seated ? -HIPS : walking ? 0.08 : 0;
    for (let i = 0; i < 2; i++) {
      const source = i ? worker.armR : worker.armL;
      arms[i].rotation.copy(source.rotation);
      const stride = (worker.feet[i].position.z - 0.05) * 5;
      legs[i].rotation.x = seated ? -1.35 + stride * 0.2 : stride;
      eyes[i].scale.y = eyeScale[i] * lid;
      pupils[i].position.y = pupilY[i] + THREE.MathUtils.clamp(worker.pupils[i].position.y - 0.7, -0.045, 0.045) * 0.35;
    }
    status.color.copy(worker.bulb.color);
    status.emissive.copy(worker.bulb.emissive);
    indicator.scale.copy(worker.bulbMesh.scale);
  }
  return { root: rig.root, pose, dispose: visual.dispose };
}
