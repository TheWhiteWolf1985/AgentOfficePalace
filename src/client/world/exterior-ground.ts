import { Path, Shape, ShapeGeometry, Vector2 } from 'three';
import { BUILDING, type Box } from '../../shared/ground';

const outline = (b: Box) => [new Vector2(b.minX, -b.minZ), new Vector2(b.maxX, -b.minZ), new Vector2(b.maxX, -b.maxZ), new Vector2(b.minX, -b.maxZ)];

/** Street surfaces surround the building; they must never cover its delivered floor or rugs. */
export function exteriorGroundGeometry(bounds: Box): ShapeGeometry {
  const shape = new Shape(outline(bounds));
  shape.holes.push(new Path(outline(BUILDING)));
  return new ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
