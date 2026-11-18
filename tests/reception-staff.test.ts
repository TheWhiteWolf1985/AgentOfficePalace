import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildReceptionStaff } from '../src/client/world/character/reception-staff.js';
import { RECEPTION_STAFF } from '../src/shared/reception-staff.js';
import { ATRIUM_COLLIDERS, ATRIUM_DATA } from '../src/shared/atrium.js';
import { blockerAt } from '../src/client/player/collide.js';

async function assets() {
  const scenes = new Map<string, THREE.Object3D>();
  for (const slot of RECEPTION_STAFF) {
    const bytes = readFileSync(new URL(`../src/client/models/${slot.model}.glb`, import.meta.url));
    const result = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
    assert.equal(result.animations.length, 0);
    scenes.set(slot.model, result.scene);
  }
  return scenes;
}
function material(root: THREE.Object3D, name: string) {
  let found: THREE.Material | undefined;
  root.traverse(n => { if (n instanceof THREE.Mesh) found ??= (Array.isArray(n.material) ? n.material : [n.material]).find(m => m.name===name); });
  assert.ok(found, name);return found as THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
}

test('the two runtime GLBs match the delivered originals and keep unit-scale rig roots', async () => {
  const scenes = await assets();
  for (const slot of RECEPTION_STAFF) {
    const runtime=readFileSync(new URL(`../src/client/models/${slot.model}.glb`, import.meta.url));
    assert.equal(createHash('sha256').update(runtime).digest('hex'),slot.sha256);
    const root=scenes.get(slot.model)!.getObjectByName('char_root')!;
    assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);
    for (const part of ['char_body','char_head','char_hair','char_eye_negx','char_eye_posx','char_mouth','char_arm_negx','char_arm_posx']) assert.ok(root.getObjectByName(part));
  }
});

test('decorative staff exist without office/session data and apply the approved 1.15 scale only to instances', async () => {
  const scenes=await assets(),staff=buildReceptionStaff(name=>scenes.get(name)!.clone(true));
  assert.equal(staff.children.length,2);
  for (const slot of RECEPTION_STAFF) {
    const actor=staff.getObjectByName(slot.id)!;
    assert.deepEqual(actor.position.toArray(),[slot.position.x,0,slot.position.z]);
    assert.deepEqual(actor.scale.toArray(),[1.15,1.15,1.15]);
    assert.deepEqual(actor.getObjectByName('char_root')!.scale.toArray(),[1,1,1]);
    const box=new THREE.Box3().setFromObject(actor);
    assert.ok(box.max.y>2 && box.max.y<2.1 && box.max.y<2.65,'faces stand above the counter and below the logo panel');
    actor.traverse(n=>assert.equal(n.userData.interact,undefined));
  }
  assert.equal(buildReceptionStaff(()=>null).children.length,0,'failed optional models do not prevent the application opening');
});

test('toon adaptation preserves every source color and isolates materials between actors and scene copies', async () => {
  const scenes=await assets(),make=()=>buildReceptionStaff(name=>scenes.get(name)!.clone(true)),first=make(),second=make();
  for (const slot of RECEPTION_STAFF) {
    const actor=first.getObjectByName(slot.id)!,source=scenes.get(slot.model)!;
    actor.traverse(n=>{if(n instanceof THREE.Mesh)for(const m of (Array.isArray(n.material)?n.material:[n.material])){
      assert.ok(m instanceof THREE.MeshToonMaterial);assert.ok(m.color.equals(material(source,m.name).color));
    }});
  }
  const a=material(first.getObjectByName('reception_npc_a')!,'char_mat_hair');
  const b=material(first.getObjectByName('reception_npc_b')!,'char_mat_hair');
  const copy=material(second.getObjectByName('reception_npc_a')!,'char_mat_hair');
  const saved=b.color.clone(),savedCopy=copy.color.clone(),original=material(scenes.get('reception_a')!,'char_mat_hair').color.clone();
  assert.ok(!a.color.equals(b.color),'blonde and brown hair remain distinct despite identical material names');
  a.color.set('#ff00ff');assert.ok(b.color.equals(saved));assert.ok(copy.color.equals(savedCopy));assert.ok(material(scenes.get('reception_a')!,'char_mat_hair').color.equals(original));
});

test('material arrays preserve face groups and do not merge equal names with different colors', () => {
  const scene=new THREE.Group(),a=new THREE.MeshStandardMaterial({color:'#ff0000'}),b=new THREE.MeshStandardMaterial({color:'#0000ff'});
  a.name=b.name='same_name';scene.add(new THREE.Mesh(new THREE.BoxGeometry(),[a,b]));
  const staff=buildReceptionStaff(()=>scene.clone(true)),mesh=staff.children[0].children[0] as THREE.Mesh;
  assert.ok(Array.isArray(mesh.material));assert.equal(mesh.material.length,2);assert.notEqual(mesh.material[0],mesh.material[1]);
  assert.ok((mesh.material[0] as THREE.MeshToonMaterial).color.equals(a.color));assert.ok((mesh.material[1] as THREE.MeshToonMaterial).color.equals(b.color));
});

test('staff bounds block walking through them and leave the original furniture clear', () => {
  const body={pos:new THREE.Vector3(),grounded:true,stepOffset:0,colliders:ATRIUM_COLLIDERS};
  for (const slot of RECEPTION_STAFF) {
    assert.equal(blockerAt(body,slot.position.x,slot.position.z,0)?.id,slot.id);
    const b=slot.collider;
    for (const c of ATRIUM_DATA.colliders.filter(c=>c.top>0.05)) {
      const overlap=Math.min(b.maxX,c.maxX)-Math.max(b.minX,c.minX)>0.001 && Math.min(b.maxZ,c.maxZ)-Math.max(b.minZ,c.minZ)>0.001 && Math.min(b.top,c.top)-Math.max(b.bottom,c.bottom)>0.001;
      assert.equal(overlap,false,`${slot.id} intersects ${c.id}`);
    }
  }
});
