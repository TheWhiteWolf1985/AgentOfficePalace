export const SIGN_MODES = ['blank', 'text', 'logo'] as const;
export type SignMode = (typeof SIGN_MODES)[number];
export const SIGN_TEXT_MAX = 400;
export const SIGN_LOGO_MAX = 2 * 1024 * 1024;
export const SIGN_IMAGE_SIDE_MAX = 4096;
export interface ReceptionLogo { id: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number; }
export interface ReceptionSignState { revision: number; mode: SignMode; text: string; logo: ReceptionLogo | null; }
export const EMPTY_RECEPTION_SIGN: ReceptionSignState = { revision: 0, mode: 'blank', text: '', logo: null };

export function signText(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Enter text for the reception sign');
  const text = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').trim();
  if ([...text].length > SIGN_TEXT_MAX || text.split('\n').length > 6 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new Error('Use up to 400 characters and 6 lines');
  return text;
}
export function signMode(raw: unknown): SignMode {
  if (!(SIGN_MODES as readonly unknown[]).includes(raw)) throw new Error('Choose a reception sign mode');
  return raw as SignMode;
}
