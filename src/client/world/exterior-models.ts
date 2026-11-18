import * as THREE from 'three';
import { prepareAtrium } from './atrium-materials';
import { applyConferenceGlazing } from './conference-glazing';
import { model } from './models';
import { batchStaticMeshes } from './static-batches';
import { batchExteriorGlazing } from './exterior-glazing';

type ExteriorName = 'atrium' | 'conference_room';
const envelope = {
  atrium: /^atrio_(wall_|window_|entrance_post_|floor_|ceiling_slab_|company_logo_surface$|logo_backing$)/,
  conference_room: /^(wall_|window_|floor_|ceiling_)/,
};

/** Keep the delivered shell's transforms and shared geometry; never alter the walkable source. */
export function selectExterior(source: THREE.Object3D, name: ExteriorName): THREE.Object3D {
  const select = (node: THREE.Object3D, keep = false): THREE.Object3D | null => {
    keep ||= envelope[name].test(node.name);
    const children = node.children.map(child => select(child, keep)).filter((child): child is THREE.Object3D => !!child);
    if (!children.length && !(keep && node instanceof THREE.Mesh)) return null;
    const copy = node.clone(false);
    if (children.length) copy.add(...children);
    return copy;
  };
  const out = new THREE.Group();
  const selected = select(source);
  if (selected) out.add(selected);
  out.name = `exterior-${name}`;
  return out;
}

/** At most two derived templates per session. Every exterior visit shares their prepared resources. */
export function createExteriorCache(
  load: (name: ExteriorName) => THREE.Object3D | null,
  prepare: (name: ExteriorName, root: THREE.Object3D) => void,
) {
  const templates = new Map<ExteriorName, THREE.Object3D>();
  return (name: ExteriorName): THREE.Object3D | null => {
    let template = templates.get(name);
    if (!template) {
      const source = load(name);
      if (!source) return null; // A later model load must remain retryable.
      template = selectExterior(source, name);
      prepare(name, template);
      // These copies have no walkable floor bindings; the original rooms keep their floor nodes.
      batchStaticMeshes(template, new Set(['atrio_company_logo_surface']), { batchFloors: true });
      batchExteriorGlazing(template);
      template.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.userData.sharedImportedGeometry = true;
        node.castShadow = false; node.receiveShadow = false;
      });
      templates.set(name, template);
    }
    return template.clone(true);
  };
}

export const exteriorModel = createExteriorCache(name => model(name)?.scene ?? null, (name, root) => {
  if (name === 'atrium') prepareAtrium(root);
  else applyConferenceGlazing(root);
});
