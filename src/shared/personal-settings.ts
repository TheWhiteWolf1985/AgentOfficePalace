import { sanitizeLook, type Look } from './avatar.js';

export type ViewMode = 'first' | 'third';
export type HudPanel = 'workers' | 'people' | 'spend' | 'limits' | 'chat' | 'floor';
export const HUD_DEFAULTS: Record<HudPanel, boolean> = { workers: false, people: false, spend: false, limits: false, chat: true, floor: false };
export const NEEDS_YOU_SOUNDS = ['off', 'once', 'remind'] as const;
export type NeedsYouSound = (typeof NEEDS_YOU_SOUNDS)[number];
export interface Settings {
  view: ViewMode;
  volume: number;
  muted: boolean;
  pageTurns: boolean;
  pushToTalk: boolean;
  notify: boolean;
  needsYouSound: NeedsYouSound;
  hud: Record<HudPanel, boolean>;
  pins: string[];
}
export interface PersonalProfile { color: string; look?: Look }
export interface PersonalPreferences { profile?: PersonalProfile; settings?: Settings }
export interface PreferencesPatch { profile?: PersonalProfile; settings?: Partial<Settings> }
export const defaultSettings = (): Settings => ({ view: 'first', volume: 0.7, muted: false, pageTurns: true, pushToTalk: false, notify: true, needsYouSound: 'once', hud: { ...HUD_DEFAULTS }, pins: [] });

export function sanitizeSettings(value: unknown, base = defaultSettings()): Settings {
  const s: Settings = { ...base, hud: { ...base.hud }, pins: [...base.pins] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return s;
  const v = value as Record<string, unknown>;
  if (v.view === 'first' || v.view === 'third') s.view = v.view;
  if (typeof v.volume === 'number' && Number.isFinite(v.volume)) s.volume = Math.max(0, Math.min(1, v.volume));
  for (const key of ['muted', 'pageTurns', 'pushToTalk', 'notify'] as const) if (typeof v[key] === 'boolean') s[key] = v[key];
  if (NEEDS_YOU_SOUNDS.includes(v.needsYouSound as NeedsYouSound)) s.needsYouSound = v.needsYouSound as NeedsYouSound;
  if (v.hud && typeof v.hud === 'object') for (const k of Object.keys(s.hud) as HudPanel[]) if (typeof (v.hud as Record<string, unknown>)[k] === 'boolean') s.hud[k] = (v.hud as Record<string, boolean>)[k];
  if (Array.isArray(v.pins)) s.pins = [...new Set(v.pins.filter((p): p is string => typeof p === 'string' && p.length <= 64))].slice(0, 30);
  return s;
}

/** Only appearance and personal settings cross the wire, never account names, roles or locations. */
export function applyPreferences(base: PersonalPreferences, patch: unknown): PersonalPreferences {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid preferences');
  const p = patch as Record<string, unknown>;
  const next = structuredClone(base);
  if (p.profile !== undefined) {
    if (!p.profile || typeof p.profile !== 'object' || Array.isArray(p.profile)) throw new Error('Invalid profile');
    const profile = p.profile as Record<string, unknown>;
    if (typeof profile.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(profile.color)) throw new Error('Invalid profile color');
    next.profile = { ...next.profile, color: profile.color };
    if (profile.look !== undefined) {
      if (!profile.look || typeof profile.look !== 'object' || Array.isArray(profile.look)) throw new Error('Invalid avatar');
      next.profile.look = sanitizeLook(profile.look, next.profile.look ?? { skin: 0, hair: 0, style: 0 });
    }
  }
  if (p.settings !== undefined) {
    if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) throw new Error('Invalid settings');
    next.settings = sanitizeSettings(p.settings, next.settings);
  }
  return next;
}
