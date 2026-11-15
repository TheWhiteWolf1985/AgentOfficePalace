import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Quaternion, Vector3 } from 'three';
import { DESK_SIZE } from '../src/shared/layout';
import { openModel } from './glb';

// desk_props.glb (exported by blender/scripts/build_desk_props.py) against what world/office/props.ts counts on:
// the mug and each arrangement of books by name, each a root of its own standing on the desk at its origin,
// the materials it paints, and the old code-built knick-knacks' footprints, which keep them clear of the
// laptop, the holiday present and whoever dances on the desk.

const props = openModel('desk_props');
const { gltf, nodes, byName } = props;

const BOOKS = ['books_upright', 'books_leaning', 'books_stack'];
const PIECES = BOOKS;
const COVERS = ['CoverRed', 'CoverBlue', 'CoverOrange'];

/** DESK_PROP_COLORS in world/office/props.ts, and the mug's body, which each desk paints in its chair's color. */
const PAINTED = ['CoverRed', 'CoverBlue', 'CoverOrange', 'Pages'];

/** Where buildDesk() puts them, in the desk's own frame (x along it, z out toward the chair). */
const BOOKS_AT = { x: DESK_SIZE.width / 2 - 0.26, z: -0.3 };

type Primitive = { attributes: Record<string, number>; material?: number; indices?: number };
const primitives = (name: string) => (gltf.meshes[nodes[byName(name)].mesh ?? -1]?.primitives ?? []) as Primitive[];
const materialOf = (p: Primitive) => gltf.materials?.[p.material ?? -1]?.name ?? '';

/** A piece's bounds, from its mesh's primitives (only those in `materials`, if given). */
function boundsOf(name: string, materials?: string[]): Box3 {
  const i = byName(name);
  const box = new Box3();
  assert.ok(primitives(name).length, `${name} has a mesh`);
  for (const p of primitives(name)) {
    if (materials && !materials.includes(materialOf(p))) continue;
    const a = gltf.accessors[p.attributes.POSITION];
    box.union(new Box3(new Vector3().fromArray(a.min!), new Vector3().fromArray(a.max!)).applyMatrix4(props.worldMatrix(i)));
  }
  return box;
}

const trianglesOf = (name: string) => primitives(name).reduce((n, p) => n + gltf.accessors[p.indices!].count / 3, 0);

const near = (a: number, b: number, tolerance = 0.005) => Math.abs(a - b) <= tolerance;
const fmt = (v: Vector3) => v.toArray().map((n) => n.toFixed(3)).join(', ');
const span = (box: Box3) => `${fmt(box.min)} to ${fmt(box.max)}`;

test('each piece is a root node of its own, at the origin and facing +z as modelled, named once', () => {
  const names = nodes.map((n) => n.name ?? '');
  assert.deepEqual([...names].sort(), [...PIECES].sort(), 'only the pieces, each named once');
  for (const name of PIECES) {
    const i = byName(name);
    assert.equal(props.parentName(i), undefined, `${name} hangs from nothing`);
    const { at, turn } = props.placed(i);
    assert.ok(at.length() < 1e-4, `${name} is at ${fmt(at)}`);
    assert.ok(turn.angleTo(new Quaternion()) < 1e-4, `${name} isn't turned`);
    assert.ok(near(boundsOf(name).min.y, 0, 1e-3), `${name} stands on the desk at its origin (${boundsOf(name).min.y.toFixed(4)})`);
  }
});

test('its materials are the ones world/office/props.ts paints, and only those, the books\' on the books', () => {
  const names = props.materials();
  for (const m of PAINTED) assert.ok(names.includes(m), `a material called ${m}`);
  for (const m of names) assert.ok(PAINTED.includes(m), `${m} isn't a material the code knows (it would come out magenta)`);
  for (const name of BOOKS) {
    assert.deepEqual(primitives(name).map(materialOf).sort(), [...COVERS, 'Pages'].sort(), `${name} is a book in each cover and their pages`);
  }
});

test('every arrangement of books fits the old books\' footprint, centred on its origin, spines to +z', () => {
  for (const name of BOOKS) {
    const box = boundsOf(name);
    const size = box.getSize(new Vector3());
    const middle = box.getCenter(new Vector3());
    assert.ok(Math.hypot(middle.x, middle.z) < 1e-3, `${name}'s footprint is centred on its origin (${fmt(middle)})`);
    assert.ok(size.x >= 0.2 && size.x <= 0.26, `${name} is ${size.x.toFixed(3)} m across`);
    assert.ok(size.z >= 0.15 && size.z <= 0.2, `${name} is ${size.z.toFixed(3)} m deep`);
    assert.ok(size.y >= 0.12 && size.y <= 0.245, `${name} is ${size.y.toFixed(3)} m tall`);
    // The boards run out past the pages at the back, where the fore-edges are; turned round, the pages would
    // show at the back only where the spines' bands are.
    const covers = boundsOf(name, COVERS);
    const pages = boundsOf(name, ['Pages']);
    assert.ok(pages.min.z > covers.min.z + 0.002, `${name}'s fore-edges are at the back (-z): pages from ${pages.min.z.toFixed(3)}, boards from ${covers.min.z.toFixed(3)}`);
    assert.ok(pages.max.z >= covers.max.z, `${name}'s spines, and the bands on them, are at the front (+z)`);
  }
});

test('where buildDesk puts them they stay in the desk\'s back corner, clear of the laptop, the stage', () => {
  const top = { x: DESK_SIZE.width / 2 - 0.03, z: DESK_SIZE.depth / 2 - 0.02 };
  const placed = (name: string, at: { x: number; z: number }) => {
    const box = boundsOf(name);
    return { minX: at.x + box.min.x, maxX: at.x + box.max.x, minZ: at.z + box.min.z, maxZ: at.z + box.max.z };
  };
  for (const [name, at] of BOOKS.map((b) => [b, BOOKS_AT] as const) as const) {
    const p = placed(name, at);
    const where = `${name} runs x ${p.minX.toFixed(3)} to ${p.maxX.toFixed(3)}, z ${p.minZ.toFixed(3)} to ${p.maxZ.toFixed(3)}`;
    assert.ok(p.maxX < top.x && p.minZ > -top.z, `${where}: on the desk`);
    // The laptop (0.78 wide at 1.3 times, in the middle) .
    assert.ok(p.minX > 0.51 + 0.05, `${where}: clear of the laptop`);
    // Whoever dances on the desk stands at (0.72, 0.18), up front.
    assert.ok(p.maxZ < 0.18 - 0.2, `${where}: behind the stage`);
  }
  // The books keep the old boxes' edges: from width/2 - 0.39 to width/2 - 0.13, z -0.39 to -0.21.
  for (const name of BOOKS) {
    const p = placed(name, BOOKS_AT);
    assert.ok(p.minX >= DESK_SIZE.width / 2 - 0.39 - 0.005 && p.maxX <= DESK_SIZE.width / 2 - 0.13 + 0.005, `${name} runs x ${p.minX.toFixed(3)} to ${p.maxX.toFixed(3)}`);
    assert.ok(p.minZ >= -0.4 && p.maxZ <= -0.2, `${name} runs z ${p.minZ.toFixed(3)} to ${p.maxZ.toFixed(3)}`);
  }
});

test('each piece is cheap: an arrangement of books under 500', () => {
  for (const name of BOOKS) assert.ok(trianglesOf(name) <= 500, `${name}: ${trianglesOf(name)} triangles`);
});
