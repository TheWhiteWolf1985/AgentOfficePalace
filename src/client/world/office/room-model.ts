import * as THREE from 'three';
import { BEANBAGS, DESK_BY_ID, MEETING_ROOM, WHITEBOARD, deskSeat, wingLevel } from '../../../shared/layout';
import { FLOOR_PALETTES, type FloorPalette } from '../../../shared/floors';
import { createWhiteboardSurface } from '../../features/whiteboard/surface';
import { model, type ModelName } from '../models';
import { batchStaticMeshes } from '../static-batches';
import type { OfficeResources } from '../deferred-office';
import type { DeskView, Interactable, Collider } from '../types';
import geometry from './office-colliders.json';
import { vacancyMarker } from './seats';

function required(root: THREE.Object3D, name: string) {
  const node = root.getObjectByName(name);
  if (!node) throw new Error('Office model is missing ' + name);
  return node;
}

function load(name: ModelName) {
  const asset = model(name);
  if (!asset) throw new Error('Office model has not loaded: ' + name);
  return asset.scene;
}

/** The office GLB supplies PlaneGeometry-compatible UVs for canvas and video. */
function surface(root: THREE.Object3D, name: string) {
  const face = required(root, 'superficie_' + name);
  if (!(face instanceof THREE.Mesh)) throw new Error('Office surface has no geometry: ' + name);
  face.material = new THREE.MeshBasicMaterial({ color: name === 'tv' ? '#1b1d2e' : '#ffffff', toneMapped: false });
  face.castShadow = face.receiveShadow = false;
  return face;
}

export function buildRoomModel({ group, desks, colliders, interactables }: OfficeResources) {
  const base = load('office_base');
  // The application supplies the operating elevator, with sliding doors, collision and live floor sign.
  const elevatorModel = required(base, 'Ascensore');
  elevatorModel.removeFromParent();
  const wings = [required(base, 'Ala_0'), load('office_wing_one'), load('office_wing_two')];
  const overflow = load('office_overflow');
  group.add(base, wings[1], wings[2], overflow);
  const palette = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  for (const root of [base, wings[1], wings[2], overflow]) {
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const prepare = (mat: THREE.MeshStandardMaterial) => {
        if (mat.transparent) { mat.depthWrite = false; node.renderOrder = 1; }
        if (!/^(Parete|Finitura|Parquet)_palette/.test(mat.name)) return mat;
        let copy = palette.get(mat);
        if (!copy) { copy = mat.clone(); palette.set(mat, copy); }
        return copy;
      };
      node.material = Array.isArray(node.material) ? node.material.map(prepare) : prepare(node.material);
      node.receiveShadow = true;
    });
  }
  const setLook = (look: FloorPalette) => {
    for (const [original, mat] of palette) {
      if (look.wall === FLOOR_PALETTES[0].wall) mat.color.copy(original.color);
      else if (mat.name.startsWith('Parete')) mat.color.set(look.wall);
      else if (mat.name.startsWith('Finitura')) mat.color.set(look.trim);
      else mat.color.set(look.floor);
    }
  };

  // All wing levels share the same DeskView (and any attached worker or laptop).
  const extension = new THREE.Group();
  group.add(extension);
  for (const id of ['desk-17', 'desk-18', 'desk-19', 'desk-20']) {
    wings[1].getObjectByName(id)?.removeFromParent();
    extension.attach(required(wings[2], id));
  }
  const byDesk = new Map<string, Interactable>();
  function register(node: THREE.Object3D, it: Interactable) {
    node.userData.interact = it;
    interactables.push(it);
    if (it.deskId) byDesk.set(it.deskId, it);
  }
  for (const root of [base, extension, overflow]) {
    root.traverse(node => {
      const def = DESK_BY_ID.get(node.name);
      if (!def) {
        const it = node.userData.interazione as Interactable | undefined;
        if (it) register(node, it);
        return;
      }
      const at = deskSeat(def, 1.25);
      register(node, node.userData.interazione ?? { kind: 'desk', deskId: def.id, x: def.beanbag ? def.x : at.x, z: def.beanbag ? def.z : at.z, radius: def.beanbag ? 1.8 : 1.3 });
      const vacancyY = def.room ? 0 : def.beanbag ? 1.25 : 1.33;
      const vacancy = def.room ? new THREE.Group() : vacancyMarker(vacancyY);
      const view: DeskView = { def, group: node as THREE.Group, chair: required(node, def.id + '__chair') as THREE.Group,
        laptopAnchor: required(node, def.id + '__laptopAnchor'), seatAnchor: required(node, def.id + '__seatAnchor'),
        stage: required(node, def.id + '__stage'), vacancy, vacancyY };
      node.add(vacancy);
      desks.set(def.id, view);
    });
  }
  colliders.push(...geometry.fixed);
  let wingColliders: Collider[] = [];
  const removeCollider = (c: Collider) => {
    const at = colliders.indexOf(c);
    if (at >= 0) colliders.splice(at, 1);
  };
  const plant = required(base, 'Piante_solo_ala_0');
  const wing = { level: -1, set(level: number) {
    level = wingLevel(level);
    if (level === wing.level) return;
    wing.level = level;
    wings.forEach((root, i) => root.visible = i === level);
    plant.visible = level === 0;
    for (const view of desks.values()) if (view.def.wing) {
      view.group.visible = view.def.wing <= level;
      byDesk.get(view.def.id)!.off = !view.group.visible;
    }
    wingColliders.forEach(removeCollider);
    wingColliders = [geometry.closed, geometry.one, geometry.two][level];
    colliders.push(...wingColliders);
  } };
  wing.set(0);
  for (const def of BEANBAGS) {
    desks.get(def.id)!.group.visible = false;
    byDesk.get(def.id)!.off = true;
  }
  const setBeanbags = (out: Set<string>) => {
    const appeared: Collider[] = [];
    BEANBAGS.forEach((def, i) => {
      const view = desks.get(def.id)!;
      const visible = out.has(def.id);
      if (view.group.visible === visible) return;
      view.group.visible = visible;
      byDesk.get(def.id)!.off = !visible;
      const collider = geometry.bags[i];
      if (visible) { colliders.push(collider); appeared.push(collider); }
      else removeCollider(collider);
    });
    return appeared;
  };
  const boardMeshes = { issues: surface(base, 'issues'), pulls: surface(base, 'pulls'), queue: surface(base, 'queue'), services: surface(base, 'services') };
  const meetingBoard = surface(base, 'riunioni'), meetingSign = surface(base, 'targa_riunioni');
  const tvScreen = surface(base, 'tv');
  const whiteboard = createWhiteboardSurface(WHITEBOARD.width, WHITEBOARD.height);
  surface(base, 'lavagna_condivisa').material = whiteboard.material;
  const leaves = ['anta_saletta_sx', 'anta_saletta_dx'].map(name => required(base, name));
  const closed = leaves.map(leaf => leaf.position.x);
  const center = (MEETING_ROOM.door.x0 + MEETING_ROOM.door.x1) / 2;
  let openness = 0;
  const update = (t: number, dt: number, people: Iterable<{x: number; y: number; z: number}>) => {
    let near = false;
    for (const p of people) if (Math.abs(p.y) < 1.6 && Math.hypot(p.x - center, p.z - MEETING_ROOM.minZ) < 2.4) { near = true; break; }
    openness = near ? Math.min(1, openness + dt * 2.5) : Math.max(0, openness - dt * 1.6);
    const offset = openness * openness * (3 - 2 * openness) * ((MEETING_ROOM.door.x1 - MEETING_ROOM.door.x0) / 2 - 0.06);
    leaves.forEach((leaf, i) => leaf.position.x = closed[i] + (i ? offset : -offset));
    for (const d of desks.values()) if (d.vacancy.visible && d.group.visible && !d.def.room) {
      d.vacancy.position.y = d.vacancyY + Math.sin(t * 2 + d.def.x) * 0.06;
      d.vacancy.rotation.y = t * 1.2;
    }
  };
  // Batch each independently switchable collection in its own coordinate frame.
  const protectedNames = new Set(leaves.map(node => node.name));
  for (const root of [...base.children, ...wings.slice(1)]) batchStaticMeshes(root, protectedNames);
  return { elevatorModel, wing, setWing: wing.set.bind(wing), setBeanbags, setLook, update, boardMeshes, meetingBoard, meetingSign, tvScreen, whiteboard };
}
