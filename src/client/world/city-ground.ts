import { Path, Shape, ShapeGeometry, Vector2 } from 'three';
import { FLOOR, WALL_T } from '../../shared/layout';

interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number; }
const building = { minX: FLOOR.minX-WALL_T, maxX: FLOOR.maxX+WALL_T, minZ: FLOOR.minZ-WALL_T, maxZ: FLOOR.maxZ+WALL_T };
const outline = (b: Bounds) => [new Vector2(b.minX, -b.minZ), new Vector2(b.maxX, -b.minZ), new Vector2(b.maxX, -b.maxZ), new Vector2(b.minX, -b.maxZ)];

/** Street surfaces surround the building; they must never cover its delivered floor or rugs. */
export function exteriorGroundGeometry(bounds: Bounds): ShapeGeometry {
  const shape = new Shape(outline(bounds));
  shape.holes.push(new Path(outline(building)));
  return new ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
