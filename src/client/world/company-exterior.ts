import * as THREE from 'three';
import { roofDrop } from '../../shared/layout';
import { model } from './models';
import { prepareAtrium } from './atrium-materials';
import { buildCompanyClouds, buildCompanyGround, type NightParts } from './outside';
import { buildTower } from './tower';

export interface CompanyExterior {
  group: THREE.Group;
  setFloors(floors: number, wings?: readonly number[]): void;
}

/** Only our building and its small lot. In the real atrium, do not build another hidden atrium. */
export function buildCompanyExterior(night: NightParts, groundFloor = false): CompanyExterior {
  const group = new THREE.Group();
  group.name = 'company-exterior';
  const ground = buildCompanyGround().group;
  ground.add(buildCompanyClouds(night));
  group.add(ground);
  const building = buildTower([], night);
  group.add(building.group);
  if (!groundFloor) {
    const atrium = model('atrium');
    if (atrium) {
      prepareAtrium(atrium.scene);
      ground.add(atrium.scene);
    }
  }
  let floorsNow = -1, wingsNow = '';
  return {
    group,
    setFloors(floors, wings = []) {
      floors = Math.max(0, floors);
      const key = wings.join();
      if (floors === floorsNow && key === wingsNow) return;
      floorsNow = floors;
      wingsNow = key;
      ground.position.y = groundFloor ? 0 : -roofDrop(floors);
      building.set(groundFloor ? -1 : floors, floors, wings);
    },
  };
}
