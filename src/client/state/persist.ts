import { onGrounds } from '../../shared/ground';
// What this browser remembers between visits, in localStorage: your profile, your settings, the floor
// you were last on and the spot you were standing in. Every read and write shrugs off blocked storage.

import { randomLook, sanitizeLook, type Look } from '../../shared/avatar';

export interface Profile {
  name: string;
  color: string;
  look: Look;
}

const PROFILE_KEY = 'agent-office.profile';
let preferenceAccount: string | undefined;
const preferenceWatchers = new Set<(patch: { profile?: { color: string; look?: Look }; settings?: Settings }) => void>();
const preferenceKey = (key: string) => preferenceAccount ? `${key}.${preferenceAccount}` : key;
export function setPreferenceAccount(account?: string) { preferenceAccount = account; }
export function onPreferenceSave(fn: (patch: { profile?: { color: string; look?: Look }; settings?: Settings }) => void) {
  preferenceWatchers.add(fn); return () => preferenceWatchers.delete(fn);
}
const preferenceSaved = (patch: { profile?: { color: string; look?: Look }; settings?: Settings }) => {
  if (preferenceAccount) for (const fn of preferenceWatchers) fn(structuredClone(patch));
};
export const AVATAR_COLORS = ['#ff8a5b', '#4f86f7', '#06d6a0', '#ef476f', '#ffd166', '#9d4edd', '#00b4d8', '#f77f00'];

/** Your saved profile. `look` is missing if you joined before there was a character select screen. */
export function loadProfile(): (Omit<Profile, 'look'> & { look?: Look }) | null {
  try {
    const p = JSON.parse(localStorage.getItem(preferenceKey(PROFILE_KEY)) ?? 'null');
    if (p && typeof p.name === 'string' && typeof p.color === 'string') {
      return { name: p.name, color: p.color, look: p.look ? sanitizeLook(p.look, randomLook()) : undefined };
    }
  } catch {
    // storage blocked
  }
  return null;
}

/** Without a look, the 3D office still has you pick a character (the 2D view saves only a name). */
export function saveProfile(p: Omit<Profile, 'look'> & { look?: Look }) {
  try {
    localStorage.setItem(preferenceKey(PROFILE_KEY), JSON.stringify(p));
  } catch {
    // storage blocked
  }
  preferenceSaved({ profile: { color: p.color, ...(p.look ? { look: p.look } : {}) } });
}

import { defaultSettings, sanitizeSettings, type Settings } from '../../shared/personal-settings';
export { HUD_DEFAULTS, NEEDS_YOU_SOUNDS, type ViewMode, type HudPanel, type NeedsYouSound, type Settings } from '../../shared/personal-settings';

const SETTINGS_KEY = 'agent-office.settings';
const FLOOR_KEY = 'agent-office.floor';

/** The floor you were last on, to come back to it after a reload. */
export function lastFloor(): string | null {
  try {
    return localStorage.getItem(FLOOR_KEY);
  } catch {
    return null;
  }
}

export function rememberFloor(id: string | null) {
  try {
    if (id) localStorage.setItem(FLOOR_KEY, id);
  } catch {
    // storage blocked
  }
}

const SPOT_KEY = 'agent-office.spot';

/** Where you were standing, on which floor (or the roof), to be back there when you come back in. */
export interface Spot {
  floor: string;
  /** What that floor was called, to say so if it's gone by then. */
  name: string;
  x: number;
  y: number;
  z: number;
  facing: number;
}

/** The spot you were last in, if this browser has one. */
export function lastSpot(): Spot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SPOT_KEY) ?? 'null');
    // Positions from retired layouts cannot be restored in the office.
    if (s && !onGrounds(s.x, s.z)) return null;
    if (s && ((s.map !== undefined && s.map !== 'office') || s.throne === true)) return null;
    const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (s && typeof s.floor === 'string' && s.floor && finite(s.x) && finite(s.y) && finite(s.z) && finite(s.facing)) {
      return { floor: s.floor, name: typeof s.name === 'string' ? s.name : '', x: s.x, y: s.y, z: s.z, facing: s.facing };
    }
  } catch {
    // storage blocked
  }
  return null;
}

export function rememberSpot(s: Spot) {
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify(s));
  } catch {
    // storage blocked
  }
}

export function loadSettings(): Settings {
  try {
    localStorage.removeItem('agent-office.golf');
    localStorage.removeItem('agent-office.bestLap');
  } catch { /* Legacy cleanup must not block loading. */ }
  try { return sanitizeSettings(JSON.parse(localStorage.getItem(preferenceKey(SETTINGS_KEY)) ?? 'null')); }
  catch { return defaultSettings(); }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(preferenceKey(SETTINGS_KEY), JSON.stringify(s));
  } catch {
    // storage blocked
  }
  preferenceSaved({ settings: s });
}
