/** Stable IDs, independent of translated labels and the legacy procedural hairstyle index. */
export const AVATAR_MODELS = ['male', 'female'] as const;
export type AvatarModel = (typeof AVATAR_MODELS)[number];
export const AVATAR_HAIRSTYLES = ['short', 'long', 'bun', 'spiky', 'curly', 'ponytail', 'bald'] as const;
export type AvatarHairstyle = (typeof AVATAR_HAIRSTYLES)[number];

export interface AvatarVariant {
  model?: AvatarModel;
  hairstyle?: AvatarHairstyle;
}
export const avatarModel = (look: AvatarVariant): AvatarModel => look.model ?? 'male';
export const avatarHairstyle = (look: AvatarVariant): AvatarHairstyle => look.hairstyle ?? (avatarModel(look) === 'female' ? 'long' : 'short');

export function sanitizeAvatarVariant(value: Record<string, unknown>, fallback: AvatarVariant): AvatarVariant {
  const model = AVATAR_MODELS.includes(value.model as AvatarModel) ? value.model as AvatarModel : fallback.model;
  const hairstyle = AVATAR_HAIRSTYLES.includes(value.hairstyle as AvatarHairstyle) ? value.hairstyle as AvatarHairstyle : fallback.hairstyle;
  return { ...(model ? { model } : {}), ...(hairstyle ? { hairstyle } : {}) };
}
