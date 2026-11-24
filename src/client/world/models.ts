import type { Look } from '../../shared/avatar';
import { avatarModel, avatarHairstyle } from '../../shared/avatar-variants';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import serverRoomUrl from '../models/server_room.glb?url';
import serverRoomExteriorUrl from '../models/server_room_exterior.glb?url';
import atriumUrl from '../models/atrium.glb?url';
import conferenceRoomUrl from '../models/conference_room.glb?url';
import deskPropsUrl from '../models/desk_props.glb?url';
import loungeUrl from '../models/lounge.glb?url';
import plantsUrl from '../models/plants.glb?url';
import receptionAUrl from '../models/reception_a.glb?url';
import receptionBUrl from '../models/reception_b.glb?url';
import femaleBaseUrl from '../models/female_base.glb?url';
import hairShortUrl from '../models/hair_short.glb?url';
import hairLongUrl from '../models/hair_long.glb?url';
import hairBunUrl from '../models/hair_bun.glb?url';
import hairSpikyUrl from '../models/hair_spiky.glb?url';
import hairCurlyUrl from '../models/hair_curly.glb?url';
import hairPonytailUrl from '../models/hair_ponytail.glb?url';
import humanBaseUrl from '../models/human_base.glb?url';
import agentMaleUrl from '../models/agent_male_base.glb?url';
import agentFemaleUrl from '../models/agent_female_base.glb?url';
import { toon } from './toon';

// The things in the world modelled in Blender rather than built in code. Each .glb is exported by a
// script in blender/scripts/ (blender/README.md has the conventions they keep); add it here by name.
// Builders request the assets they need before taking a copy with model().

import officeBaseUrl from '../../../sala_ufficio/geometria/ufficio_base.glb?url';
import officeWingOneUrl from '../../../sala_ufficio/geometria/varianti/ala_1.glb?url';
import officeWingTwoUrl from '../../../sala_ufficio/geometria/varianti/ala_2.glb?url';
import officeOverflowUrl from '../../../sala_ufficio/geometria/varianti/posti_aggiuntivi.glb?url';

const MODELS = {
  office_base: { url: officeBaseUrl },
  office_wing_one: { url: officeWingOneUrl },
  office_wing_two: { url: officeWingTwoUrl },
  office_overflow: { url: officeOverflowUrl },
  atrium: { url: atriumUrl },
  server_room: { url: serverRoomUrl },
  server_room_exterior: { url: serverRoomExteriorUrl },
  conference_room: { url: conferenceRoomUrl },
  desk_props: { url: deskPropsUrl },
  lounge: { url: loungeUrl },
  plants: { url: plantsUrl },
  reception_a: { url: receptionAUrl },
  reception_b: { url: receptionBUrl },
  human_base: { url: humanBaseUrl },
  human_female: { url: femaleBaseUrl },
  agent_male: { url: agentMaleUrl },
  agent_female: { url: agentFemaleUrl },
  hair_short: { url: hairShortUrl },
  hair_long: { url: hairLongUrl },
  hair_bun: { url: hairBunUrl },
  hair_spiky: { url: hairSpikyUrl },
  hair_curly: { url: hairCurlyUrl },
  hair_ponytail: { url: hairPonytailUrl },

} satisfies Record<string, { url: string }>;

export type ModelName = keyof typeof MODELS;

export interface Model {
  /** This copy's scene: its own nodes and bones, sharing the geometry and materials with every other copy. */
  scene: THREE.Object3D;
  /** Its animations, by name. Shared too: an AnimationMixer only reads them. */
  clips: THREE.AnimationClip[];
}

const loading = new Map<ModelName, Promise<GLTF>>();
const loaded = new Map<ModelName, GLTF>();

/**
 * How far the model files have got: how many have been asked for so far, and how many of those are done
 * (loaded, or given up on). Counted by file rather than by byte, since a file's size is only known when the
 * response says it.
 */
export interface ModelsProgress {
  asked: number;
  done: number;
}

const progress: ModelsProgress = { asked: 0, done: 0 };
const watchers = new Set<(p: ModelsProgress) => void>();

/**
 * Calls `fn` with the files' progress now, and again each time a file is asked for, gets more of itself in,
 * or is done (see ModelsProgress). The loading screen fills its bar with it, and while the calls keep coming
 * it knows a slow download is still going. Returns a function that stops the calls.
 */
export function onModelsProgress(fn: (p: ModelsProgress) => void): () => void {
  watchers.add(fn);
  fn({ ...progress });
  return () => watchers.delete(fn);
}

function tell() {
  for (const fn of watchers) fn({ ...progress });
}

/** Each file loads once, the first time something asks for it. */
function fetchModel(name: ModelName): Promise<GLTF> {
  let p = loading.get(name);
  if (!p) {
    // Each chunk that comes in tells the watchers too, though the counts are still by file.
    p = new GLTFLoader().loadAsync(MODELS[name].url, () => tell()).then((gltf) => {
      loaded.set(name, gltf);
      return gltf;
    }).catch(error => { loading.delete(name); throw error; });
    loading.set(name, p);
    progress.asked++;
    tell();
    // Done either way: one that failed still rejects for whoever asked for it.
    const done = () => {
      progress.done++;
      tell();
    };
    void p.then(done, done);
  }
  return p;
}

// A plain clone() would leave a copy's skin bound to the original's bones.
const copy = (gltf: GLTF): Model => ({ scene: clone(gltf.scene), clips: gltf.animations });

/** A copy of a model to pose and dress on its own, once it has loaded. */
export async function loadModel(name: ModelName): Promise<Model> {
  return copy(await fetchModel(name));
}

/** Shared spaces need their own geometry and the meeting-room exterior visible on the tower. */
export const COMMON_MODELS: readonly ModelName[] = ['atrium', 'conference_room', 'server_room_exterior', 'reception_a', 'reception_b'];
export const OFFICE_MODELS: readonly ModelName[] = [...COMMON_MODELS, 'office_base', 'office_wing_one', 'office_wing_two', 'office_overflow'];
export function avatarModels(look: Look): ModelName[] {
  const hair = avatarHairstyle(look);
  return [avatarModel(look) === 'female' ? 'human_female' : 'human_base', ...(hair === 'bald' ? [] : [`hair_${hair}` as ModelName])];
}
export const avatarReady = (look: Look): boolean => avatarModels(look).every(name => loaded.has(name));
export const preloadAvatar = (look: Look): Promise<void> => preloadModels(avatarModels(look));

/** Load only the requested set, reusing both completed and concurrent requests. The lab can request all. */
export async function preloadModels(names: readonly ModelName[] = Object.keys(MODELS) as ModelName[]): Promise<void> {
  await Promise.all([...new Set(names)].map(name => fetchModel(name)));
}

/** A copy of an already requested model, or null until it has loaded. */
export function model(name: ModelName): Model | null {
  const gltf = loaded.get(name);
  return gltf ? copy(gltf) : null;
}

/**
 * A painted copy of one piece of a `preload` model, the object called `part` in it, for a model that holds
 * several things placed each on their own (a plant of each species, the lounge's sofa and its table).
 * `paint` gives the material for each name, as for paintModel(). If the model didn't load, or has no such
 * piece, an empty group: the office opens without it.
 */
export function piece(name: ModelName, part: string, paint: (name: string) => THREE.Material, castShadow = true): THREE.Object3D {
  const copy = loaded.get(name)?.scene.getObjectByName(part)?.clone();
  if (!copy) return new THREE.Group();
  paintModel(copy, paint, castShadow);
  return copy;
}

/**
 * Paints a model the office's way: every material it came with is only a name (see blender/README.md),
 * and `paint` gives the material to use for each. Meshes cast and take shadows like mesh()'s do.
 */
export function paintModel(root: THREE.Object3D, paint: (name: string) => THREE.Material, castShadow = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = paint((m.material as THREE.Material).name);
    m.castShadow = castShadow;
    m.receiveShadow = true;
  });
}

/**
 * The usual `paint`: a toon material of the palette's color for each name. A name the palette has no
 * color for comes out magenta, so a part the script and the code disagree on shows at a glance.
 */
export function palette(colors: Record<string, string>): (name: string) => THREE.Material {
  return (name) => toon(colors[name] ?? '#ff00ff');
}
