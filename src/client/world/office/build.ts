import * as THREE from 'three';
import { BOARDS, BOOKSHELF, ELEVATOR, FLOOR, TV, WALL_HEIGHT, WINDOWS, LOFT, STAIRS, WING, streetBelow } from '../../../shared/layout';
import { wallFacing, type WallId, type WallRect } from '../../../shared/decor';
import { createNightParts } from '../night';
import { buildCompanyGround, buildCompanyClouds } from '../outside';
import { buildElevator } from '../elevator';
import { exteriorModel } from '../exterior-models';
import { buildTower } from '../tower';
import { buildDeskSigns } from '../desksigns';
import { wetPane } from './shell';
import { buildRoomModel } from './room-model';
import type { OfficeResources } from '../deferred-office';
import type { Office } from '../types';

/** Exclusion rectangles for user-hung pictures on the occupied sections of each wall. */
function wallFixtures(): WallRect[] {
  const walls: WallRect[] = [];
  function reserve(wall: WallId, u: number, y: number, width: number, height: number) {
    walls.push({ wall, u0: u - width / 2, u1: u + width / 2, y0: y - height / 2, y1: y + height / 2 });
  }
  for (const w of WINDOWS) reserve(w.wall, w.u, (w.y0 + w.y1) / 2, w.width + 0.2, w.y1 - w.y0 + 0.2);
  for (const b of Object.values(BOARDS)) {
    const wall = wallFacing(b.rotY);
    const bottom = b.y - (b.height + 0.3) / 2;
    reserve(wall, wall === 'north' || wall === 'south' ? b.x : b.z, (bottom + WALL_HEIGHT) / 2, b.width + 0.3, WALL_HEIGHT - bottom);
  }
  reserve('south', BOOKSHELF.x, 1.4, BOOKSHELF.width + 0.2, 2.8);
  reserve('east', TV.z, TV.y, TV.width + 0.3, TV.height + 0.2);
  reserve('north', ELEVATOR.x, WALL_HEIGHT / 2, ELEVATOR.width + 0.1, WALL_HEIGHT);
  reserve('north', (WING.minX + FLOOR.maxX) / 2, WALL_HEIGHT / 2, FLOOR.maxX - WING.minX, WALL_HEIGHT);
  const run = (STAIRS.toX - STAIRS.fromX) / STAIRS.steps;
  for (let i = 1; i <= STAIRS.steps; i++) {
    const height = i * LOFT.y / STAIRS.steps;
    reserve('south', STAIRS.fromX + (i - 0.5) * run, height / 2, run, height);
  }
  reserve('east', (LOFT.minZ + LOFT.maxZ) / 2, LOFT.y + 0.5, 2.4, 1);
  reserve('south', LOFT.maxX - 3, LOFT.y + 1.9, 2.6, 0.6);
  return walls;
}

export function buildOffice(resources: OfficeResources = { group: new THREE.Group(), desks: new Map(), colliders: [], interactables: [], night: createNightParts() }): Office {
  const { group, night, colliders, interactables } = resources;
  const room = buildRoomModel(resources);
  for (const window of WINDOWS) group.add(wetPane(window, night.wetGlass));
  for (const [x, z] of [[-10.5,-4], [-1.5,-4], [-10.5,4], [-1.5,4], [13,0]]) {
    night.halos.push({ at: new THREE.Vector3(x, 3.93, z), size: 1.3, color: '#ffe08a' });
  }
  const elevator = buildElevator(WALL_HEIGHT, room.elevatorModel), signs = buildDeskSigns();
  group.add(elevator.group, signs.group);
  colliders.push(...elevator.colliders);
  interactables.push(elevator.interactable);
  const tower = buildTower(colliders, night);
  const street = buildCompanyGround().group;
  street.add(buildCompanyClouds(night));
  const atrium = exteriorModel('atrium');
  if (atrium) street.add(atrium);
  group.add(tower.group, street);
  const fixtures = wallFixtures();
  return { ...resources, ...room, elevator, signs, fixtures: () => fixtures,
    setProjectName: name => elevator.setSign('🛗 ' + name),
    setLevel(index, count, wings = []) {
      street.position.y = night.street = streetBelow(index);
      tower.set(index, count, wings);
    },
    update(t, dt, people) { room.update(t, dt, people); elevator.update(dt); }
  };
}
