import * as THREE from 'three';
import { deinterleaveGeometry, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const materials = new Set(['mat_glass_blue', 'mat_glass_reflection', 'atrio_mat_glass']);
const axes = ['x', 'y', 'z'] as const;

/** Only the derived exterior: disjoint panes on one facade share a draw, never different glass planes. */
export function batchExteriorGlazing(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, { node: THREE.Mesh; matrix: THREE.Matrix4; box: THREE.Box3; axis: number }[]>();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh || node instanceof THREE.InstancedMesh || node.children.length) return;
    const mat = node.material;
    const geo: THREE.BufferGeometry = node.geometry;
    if (Array.isArray(mat) || !materials.has(mat.name) || !mat.transparent || mat.depthWrite || !mat.visible) return;
    if (Object.keys(geo.morphAttributes).length || !geo.getAttribute('position') || geo.drawRange.start !== 0 || geo.drawRange.count !== Infinity) return;
    if (node.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || node.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld);
    if (matrix.determinant() <= 0) return;
    const box = new THREE.Box3(), vertex = new THREE.Vector3(), position = geo.getAttribute('position');
    for (let i = 0; i < position.count; i++) box.expandByPoint(vertex.fromBufferAttribute(position, i));
    box.applyMatrix4(matrix);
    const size = box.getSize(new THREE.Vector3()).toArray();
    const axis = size.indexOf(Math.min(...size));
    // The delivered facade panes are thin axis-aligned boxes or sheets; other shapes stay sortable.
    if (size[axis] > .3 || size.some((s, i) => i !== axis && s < .09)) return;
    const plane = [box.min.getComponent(axis), box.max.getComponent(axis)].map(n => Math.round(n * 10000)).join(':');
    const attributes = Object.entries(geo.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}:${attr.array.constructor.name}`).join('|');
    const key = `${mat.uuid}:${axis}:${plane}:${node.castShadow}:${node.receiveShadow}:${node.renderOrder}:${node.frustumCulled}:${node.layers.mask}:${!!geo.index}:${attributes}`;
    const list = groups.get(key) ?? []; list.push({ node, matrix, box, axis }); groups.set(key, list);
  });
  let sourceMeshes = 0, batches = 0;
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    const projected = axes.filter((_, i) => i !== entries[0].axis);
    const overlaps = entries.some((a, i) => entries.slice(i + 1).some(b => projected.every(axis => Math.min(a.box.max[axis], b.box.max[axis]) - Math.max(a.box.min[axis], b.box.min[axis]) > .0001)));
    if (overlaps) continue; // Overlapping transparent surfaces still need independent sorting.
    const copies = entries.map(({ node, matrix }) => {
      const copy = node.geometry.clone(); deinterleaveGeometry(copy); copy.clearGroups(); copy.applyMatrix4(matrix); return copy;
    });
    const geometry = mergeGeometries(copies, false);
    for (const copy of copies) copy.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const first = entries[0].node, batch = new THREE.Mesh(geometry, first.material);
    batch.name = `exterior-glazing-${batches++}`;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder; batch.frustumCulled = first.frustumCulled; batch.layers.mask = first.layers.mask;
    batch.userData.exteriorGlazingSources = entries.map(e => e.node.name);
    for (const { node } of entries) node.removeFromParent();
    root.add(batch); sourceMeshes += entries.length;
  }
  const result = { sourceMeshes, batches, meshesSaved: sourceMeshes - batches };
  root.userData.exteriorGlazing = result;
  return result;
}
