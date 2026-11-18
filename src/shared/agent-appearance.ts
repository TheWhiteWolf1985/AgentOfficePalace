import { AVATAR_COLOR_ROLES, AVATAR_HEX } from './avatar-colors.js';
import { AVATAR_HAIRSTYLES, AVATAR_MODELS, type AvatarHairstyle, type AvatarModel } from './avatar-variants.js';
import { characterPalette } from './character-palette.js';

export const AGENT_COLOR_ROLES = [...AVATAR_COLOR_ROLES, 'accent', 'mouth', 'bow'] as const;
export type AgentColorRole = (typeof AGENT_COLOR_ROLES)[number];
export interface AgentAppearance {
  model: AvatarModel;
  hairstyle: AvatarHairstyle;
  colors: Partial<Record<AgentColorRole, string>>;
}

export function sanitizeAgentAppearance(value: unknown): AgentAppearance | undefined {
  if (!value || typeof value !== 'object') return;
  const { model, hairstyle, colors } = value as Partial<AgentAppearance>;
  if (!AVATAR_MODELS.includes(model as AvatarModel) || !AVATAR_HAIRSTYLES.includes(hairstyle as AvatarHairstyle)) return;
  const accepted: AgentAppearance['colors'] = {};
  for (const role of AGENT_COLOR_ROLES) {
    const color = colors?.[role];
    if (role === 'bow' && model !== 'female') continue;
    if (typeof color === 'string' && AVATAR_HEX.test(color)) accepted[role] = color.toLowerCase();
  }
  return { model: model!, hairstyle: hairstyle!, colors: accepted };
}

export function randomAgentAppearance(random = Math.random): AgentAppearance {
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const model = pick(AVATAR_MODELS);
  const hairstyle = pick(AVATAR_HAIRSTYLES);
  const colors: AgentAppearance['colors'] = {};
  for (const role of AGENT_COLOR_ROLES) {
    if (role === 'bow' && model !== 'female') continue;
    colors[role] = pick(characterPalette.random[role]);
  }
  return { model, hairstyle, colors };
}

/** Stable appearance for saved workers predating the field and decorative board agents. */
export function agentAppearanceForId(id: string): AgentAppearance {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  return randomAgentAppearance(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
}
