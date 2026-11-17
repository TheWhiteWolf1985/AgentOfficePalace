import * as THREE from 'three';
import type { Collider, DeskView, Interactable, Office } from './types';
import type { NightParts } from './outside';

export interface OfficeResources {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  desks: Map<string, DeskView>;
  night: NightParts;
}
interface Deferred { current?: Office; pending?: Promise<Office>; listeners: Set<(office: Office) => void>; load(): Promise<Office> }
const deferred = new WeakMap<Office, Deferred>();
export const officeLoaded = (office: Office): boolean => !deferred.has(office) || !!deferred.get(office)!.current;
export function whenOfficeReady(office: Office, fn: (office: Office) => void): () => void {
  const state = deferred.get(office);
  if (!state || state.current) { fn(state?.current ?? office); return () => {}; }
  state.listeners.add(fn); return () => state.listeners.delete(fn);
}
export const ensureOffice = (office: Office): Promise<Office> => deferred.get(office)?.load() ?? Promise.resolve(office);

/** Stable containers let common features run without creating desks, furniture or a hidden office. */
export function createDeferredOffice(night: NightParts, prepare: () => Promise<void>, build: (resources: OfficeResources) => Office): Office {
  const resources: OfficeResources = { group: new THREE.Group(), colliders: [], interactables: [], desks: new Map(), night };
  resources.group.name = 'project-office';
  const idle = { ...resources, fixtures: () => [], setLook: () => {}, setLevel: () => {}, setProjectName: () => {}, update: () => {} };
  const state: Deferred = {
    listeners: new Set(),
    load() {
      if (state.current) return Promise.resolve(state.current);
      return state.pending ??= prepare().then(() => {
        const lengths = { bulbs: night.bulbs.length, halos: night.halos.length, lamps: night.lamps.length, windows: night.windows.length, glows: night.glows.length };
        const children = new Set(resources.group.children), colliders = resources.colliders.length, interactables = resources.interactables.length, desks = new Set(resources.desks.keys());
        let actual: Office;
        try { actual = build(resources); }
        catch (error) {
          for (const child of [...resources.group.children]) if (!children.has(child)) resources.group.remove(child);
          resources.colliders.length = colliders; resources.interactables.length = interactables;
          for (const key of resources.desks.keys()) if (!desks.has(key)) resources.desks.delete(key);
          for (const key of Object.keys(lengths) as (keyof typeof lengths)[]) night[key].splice(lengths[key]);
          throw error;
        }
        state.current = actual;
        for (const fn of state.listeners) fn(actual);
        state.listeners.clear();
        return actual;
      }).catch(error => { state.pending = undefined; throw error; });
    },
  };
  const proxy = new Proxy(idle, {
    get(target, key) {
      if (state.current) return Reflect.get(state.current, key);
      if (key in target || typeof key === 'symbol') return Reflect.get(target, key);
      throw new Error(`Project office is not loaded: ${String(key)}`);
    },
  }) as unknown as Office;
  deferred.set(proxy, state);
  return proxy;
}
