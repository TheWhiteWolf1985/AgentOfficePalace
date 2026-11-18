import * as THREE from 'three';

// Ignore sub-micrometre settling from eased doors/cameras, retaining the last cast's transform.
const EPSILON = 1e-8;
const sameMatrix = (a: THREE.Matrix4, b: THREE.Matrix4) => a.elements.every((value, i) => Math.abs(value - b.elements[i]) <= EPSILON);
const sameRotation = (a: THREE.Quaternion, b: THREE.Quaternion) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.w - b.w) <= EPSILON;

interface NodeState {
  node: THREE.Object3D;
  parent: THREE.Object3D | null;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  matrix: THREE.Matrix4;
  visible: boolean;
  layers: number;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
  sides: string;
  version: number;
  indexVersion?: number;
  start?: number;
  count?: number;
}

/** Reuse intersections while camera and pickable geometry stay still, including their parents. */
export class SceneRaycast {
  private raycaster = new THREE.Raycaster();
  private states: NodeState[] = [];
  private cameraMatrix = new THREE.Matrix4();
  private projection = new THREE.Matrix4();
  private ndc = new THREE.Vector2(Infinity, Infinity);
  private far = -1;
  private hits: THREE.Intersection[] = [];

  intersect(camera: THREE.PerspectiveCamera, ndc: THREE.Vector2, roots: THREE.Object3D[], far: number) {
    camera.updateWorldMatrix(true, false);
    let changed = !sameMatrix(this.cameraMatrix, camera.matrixWorld) || !sameMatrix(this.projection, camera.projectionMatrix)
      || !this.ndc.equals(ndc) || (this.far !== far && Math.abs(this.far - far) > EPSILON);
    let index = 0;
    const visit = (node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      const geometry = mesh.isMesh ? mesh.geometry : undefined;
      const material = mesh.isMesh ? mesh.material : undefined;
      const sides = Array.isArray(material) ? material.map(m => m.side).join(',') : String(material?.side);
      const attribute = geometry?.getAttribute('position');
      const version = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute?.version ?? 0;
      let state = this.states[index++];
      const different = !state || state.node !== node || state.parent !== node.parent
        || state.position.distanceToSquared(node.position) > EPSILON ** 2 || !sameRotation(state.quaternion, node.quaternion)
        || state.scale.distanceToSquared(node.scale) > EPSILON ** 2
        || (!node.matrixAutoUpdate && !sameMatrix(state.matrix, node.matrix)) || state.visible !== node.visible || state.layers !== node.layers.mask
        || state.geometry !== geometry || state.material !== material || state.sides !== sides || state.version !== version
        || state.indexVersion !== geometry?.index?.version || state.start !== geometry?.drawRange.start || state.count !== geometry?.drawRange.count;
      if (!different) return;
      changed = true;
      state = {
        node, parent: node.parent, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
        matrix: node.matrix.clone(), visible: node.visible, layers: node.layers.mask, geometry, material, sides, version,
        indexVersion: geometry?.index?.version, start: geometry?.drawRange.start, count: geometry?.drawRange.count,
      };
      this.states[index - 1] = state;
    };
    for (const root of roots) {
      for (let parent = root.parent; parent; parent = parent.parent) visit(parent);
      root.traverse(visit);
    }
    if (this.states.length !== index) changed = true;
    this.states.length = index;
    if (!changed) return this.hits;
    this.cameraMatrix.copy(camera.matrixWorld); this.projection.copy(camera.projectionMatrix);
    this.ndc.copy(ndc); this.far = far;
    for (const root of roots) root.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(ndc, camera);
    this.raycaster.far = far;
    this.hits.length = 0;
    this.raycaster.intersectObjects(roots, true, this.hits);
    return this.hits;
  }
}
