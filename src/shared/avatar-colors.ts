/** The nine independent color channels of the delivered human revision 02. */
export const AVATAR_COLOR_ROLES = ['skin', 'hair', 'eyebrows', 'iris', 'clothing', 'shirt', 'tie', 'pants', 'shoes'] as const;
export type AvatarColorRole = (typeof AVATAR_COLOR_ROLES)[number];
export type AvatarColors = Record<AvatarColorRole, string> & { version: 1 };

/** sRGB colors of the delivered GLB. Old profiles keep the previously displayed appearance. */
export const DEFAULT_AVATAR_COLORS: Readonly<AvatarColors> = Object.freeze({
  version: 1, skin: '#deb58e', hair: '#957951', eyebrows: '#957951', iris: '#247cb8',
  clothing: '#181d24', shirt: '#f3f5f3', tie: '#b8161d', pants: '#181d24', shoes: '#0d1219',
});
export const AVATAR_HEX = /^#[0-9a-f]{6}$/i;

/** Whitelist fields and color syntax; unknown schema versions keep the existing appearance. */
export function sanitizeAvatarColors(value: unknown, fallback: Readonly<AvatarColors> = DEFAULT_AVATAR_COLORS): AvatarColors {
  const result: AvatarColors = { ...fallback };
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== 1) return result;
  const input = value as Record<string, unknown>;
  for (const role of AVATAR_COLOR_ROLES) {
    const color = input[role];
    if (typeof color === 'string' && AVATAR_HEX.test(color)) result[role] = color.toLowerCase();
  }
  return result;
}

/** Initial WebSocket connections use a small JSON query field; updates use Look.colors. */
export function avatarColorsFromQuery(value: string | null): AvatarColors | undefined {
  if (!value || value.length > 512) return;
  try { return sanitizeAvatarColors(JSON.parse(value)); } catch { return; }
}
