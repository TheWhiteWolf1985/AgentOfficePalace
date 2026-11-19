import * as THREE from 'three';
import { deinterleaveGeometry, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge only opaque static leaves; bindings, animation and transparent sorting stay independent. */
export function batchStaticMeshes(root: THREE.Object3D, protectedNames: ReadonlySet<string> = new Set(), options: { batchFloors?: boolean; staticDoors?: boolean } = {}) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  const protectedNode = (node: THREE.Object3D) => {
    for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) {
      if (protectedNames.has(n.name) || n.userData.interact || (/pivot|anchor|seat_|rug/i.test(n.name) || (!options.staticDoors && /door/i.test(n.name))) || (!options.batchFloors && /floor/i.test(n.name))) return true;
    }
    return false;
  };
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh || node instanceof THREE.InstancedMesh || node.children.length || protectedNode(node)) return;
    if (Array.isArray(node.material) || node.material.transparent || node.material.opacity < 1 || !node.material.visible) return;
    if (node.material instanceof THREE.MeshBasicMaterial || (node.material as THREE.MeshToonMaterial).map) return;
    const geo: THREE.BufferGeometry = node.geometry;
    if (!geo.getAttribute('position') || Object.keys(geo.morphAttributes).length || geo.drawRange.start !== 0 || geo.drawRange.count !== Infinity) return;
    if (node.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || node.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld);
    if (matrix.determinant() <= 0) return; // Mirrored winding is deliberately kept as delivered.
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const attributes = Object.entries(geo.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}:${attr.array.constructor.name}`).join('|');
    const cell = `${Math.floor(position.x / 12)},${Math.floor(position.y / 6)},${Math.floor(position.z / 12)}`;
    const key = `${node.material.uuid}:${node.castShadow}:${node.receiveShadow}:${node.renderOrder}:${node.frustumCulled}:${node.layers.mask}:${!!geo.index}:${attributes}:${cell}`;
    const list = groups.get(key) ?? []; list.push(node); groups.set(key, list);
  });
  let sourceMeshes = 0, batches = 0;
  for (const nodes of groups.values()) {
    if (nodes.length < 2) continue;
    const geometries = nodes.map(node => {
      const geometry = node.geometry.clone();
      deinterleaveGeometry(geometry);
      geometry.clearGroups();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const first = nodes[0], mesh = new THREE.Mesh(merged, first.material);
    mesh.name = `static-batch-${batches++}`;
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder; mesh.frustumCulled = first.frustumCulled; mesh.layers.mask = first.layers.mask;
    mesh.userData.staticBatchSources = nodes.map(node => node.name);
    for (const node of nodes) node.removeFromParent(); // Never dispose shared imported geometry/materials.
    root.add(mesh); sourceMeshes += nodes.length;
  }
  const result = { sourceMeshes, batches, meshesSaved: sourceMeshes - batches };
  root.userData.staticBatches = result;
  return result;
}

