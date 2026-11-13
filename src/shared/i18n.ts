import { italian } from './locales/it.js';

export const LANGUAGES = ['it', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
let language: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return value === 'it' || value === 'en';
}

export function getLanguage(): Language { return language; }
export function setLanguage(value: Language): void { language = value; }
export function languageTag(): string { return language === 'it' ? 'it-IT' : 'en-US'; }

/** English source text is the stable key. Values are interpolated after lookup,
 * so user names, repository content and terminal output never become keys. */
export function t(message: string): string;
export function t(parts: TemplateStringsArray, ...values: unknown[]): string;
export function t(message: string | TemplateStringsArray, ...values: unknown[]): string {
  const key = typeof message === 'string' ? message : message.reduce((s, part, i) => s + (i ? `{${i - 1}}` : '') + part, '');
  const translated = language === 'it' ? italian[key] ?? key : key;
  return typeof message === 'string' ? translated : translated.replace(/\{(\d+)\}/g, (_, i: string) => String(values[Number(i)]));
}
