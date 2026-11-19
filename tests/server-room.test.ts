import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SERVER_ROOM_COLLIDERS, SERVER_ROOM_DATA, SERVER_ROOM_SEATING } from '../src/shared/server-room.js';
import { serverRoomRoute } from '../src/shared/server-room-nav.js';
import { LOBBY, ROOF, SERVER_ROOM } from '../src/shared/rooftop.js';
import { STOREY, SERVER_ROOM_STOREY, serverDrop, roofDrop, seatHere } from '../src/shared/layout.js';
import { blockerAt, groundAt } from '../src/client/player/collide.js';
import { prepareServerRoom } from '../src/client/world/server-room-materials.js';
import { selectExterior } from '../src/client/world/exterior-models.js';
import { buildTower } from '../src/client/world/tower.js';
import { spaceCapabilities } from '../src/shared/space-capabilities.js';
import { openModel } from './glb.js';
import type { NightParts } from '../src/client/world/outside.js';

test('server delivery retains original bytes, axes, 60 racks and two independent operator seats', () => {
  const bytes = readFileSync(new URL('../src/client/models/server_room.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SERVER_ROOM_DATA.sourceSha256);
  const glb = openModel('server_room'); assert.equal(SERVER_ROOM_DATA.rackCount, 60);
  for (const s of SERVER_ROOM_DATA.seats) {
    const at = glb.placed(glb.byName(s.id)).at;
    assert.ok(at.distanceTo(new THREE.Vector3(s.position.x,s.position.y,s.position.z)) < .0001);
    assert.deepEqual(seatHere(s.id+':0', SERVER_ROOM)?.stand, s.stand);
    for (const other of [LOBBY, ROOF, 'project', false]) assert.equal(seatHere(s.id+':0', other), undefined);
  }
  for (const seat of ['seat_001:0','couch:0','atrio_lounge_seat_sofa_left0:0']) assert.equal(seatHere(seat, SERVER_ROOM), undefined);
  assert.equal(SERVER_ROOM_SEATING.length, 2);
  assert.deepEqual(spaceCapabilities(SERVER_ROOM, true), {project:false,whiteboard:false,presentation:false});
});

test('operators and rack aisles are reachable from the elevator while racks, glass and desks stay solid', () => {
  assert.equal(SERVER_ROOM_COLLIDERS.filter(c=>c.role==='rack_reference_box').length,60);
  assert.equal(SERVER_ROOM_COLLIDERS.filter(c=>c.role==='access_door').length,1,'opening the door must clear the entire passage');
  const openDoor = SERVER_ROOM_COLLIDERS.filter(c => c.role !== 'access_door');
  const body = { pos:new THREE.Vector3(8.5,0,-10), grounded:true, stepOffset:0, colliders:openDoor };
  for (const at of [...SERVER_ROOM_DATA.seats.map(s=>s.stand), {x:0,z:3}, {x:-15,z:0}, {x:-5,z:-11}]) {
    assert.equal(blockerAt(body,at.x,at.z,0),null,JSON.stringify(at));
    assert.equal(groundAt(openDoor,at.x,at.z,0),0);
    const path = serverRoomRoute(body.pos,at);
    assert.ok(path.length && Math.hypot(path.at(-1)!.x-at.x,path.at(-1)!.z-at.z)<.65,JSON.stringify(at));
  }
  for (const at of [{x:-13.45,z:8.5},{x:10,z:5},{x:6.1,z:5},{x:-18,z:0}]) assert.ok(blockerAt(body,at.x,at.z,0),JSON.stringify(at));
  body.colliders = SERVER_ROOM_COLLIDERS;
  assert.ok(blockerAt(body,6.1,0,0),'closed door occupies only its actual passage');
});

test('compact exterior removes equipment buffers and preserves glazing, geometry and architectural transforms', async () => {
  const bytes = readFileSync(new URL('../src/client/models/server_room_exterior.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),SERVER_ROOM_DATA.exteriorSha256);
  assert.ok(bytes.length<200_000);
  const shell = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const glb = openModel('server_room'), derived=selectExterior(shell,'server_room');
  derived.updateMatrixWorld(true);let meshes=0, glass=0;
  derived.traverse(n=>{
    assert.ok(!/rack|keypad|workstation|maintenance|ops_|whiteboard/.test(n.name),n.name);
    if (!(n instanceof THREE.Mesh)) return;
    meshes++; const at = n.getWorldPosition(new THREE.Vector3());
    assert.ok(at.distanceTo(glb.placed(glb.byName(n.name)).at)<.0001,n.name);
    if ((n.material as THREE.Material).transparent) glass++;
  });
  assert.ok(meshes>20 && meshes<150); assert.ok(glass>=20);
  prepareServerRoom(derived);
  derived.traverse(n=>{if(n instanceof THREE.Mesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.transparent){assert.equal(m.depthWrite,false);assert.ok(m.opacity<.2);}});
});

test('tower places the server room below the final meeting room for zero, one and many offices', () => {
  const model=(name:string)=>{const g=new THREE.Group();g.name='exterior-'+name;return g;};
  const tower=buildTower([], {windows:[]} as unknown as NightParts,model);
  for(const count of [0,1,4])for(const index of [-1,0,count,count+1]) {
    tower.set(index,count);
    const reference=index===count+1?count*STOREY+SERVER_ROOM_STOREY:index*STOREY;
    const server=tower.group.getObjectByName('exterior-server_room'),roof=tower.group.getObjectByName('exterior-conference_room');
    if(index===count)assert.equal(server,undefined);else{assert.ok(server);assert.equal(server.position.y,count*STOREY-reference);}
    if(index===count+1)assert.equal(roof,undefined);else{assert.ok(roof);assert.equal(roof.position.y,count*STOREY+SERVER_ROOM_STOREY-reference);}
    assert.equal(serverDrop(count),(count+1)*STOREY);assert.equal(roofDrop(count),serverDrop(count)+SERVER_ROOM_STOREY);
  }
});
