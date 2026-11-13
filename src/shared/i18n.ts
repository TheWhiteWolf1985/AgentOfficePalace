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

// Server errors stay canonical on the wire. Only callers displaying an error
// or a toast opt in; never run this on chat, prompts, file bodies or terminals.
const remotePatterns = Object.keys(italian).filter((key) => /\{\d+\}/.test(key) && key.replace(/\{\d+\}/g, '').length >= 24)
  .sort((a, b) => b.length - a.length).map((key) => {
    const indices: number[] = [];
    const escaped = key.split(/(\{\d+\})/).map((part) => {
      const slot = /^\{(\d+)\}$/.exec(part);
      if (slot) { indices.push(Number(slot[1])); return '([\\s\\S]*?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { key, indices, pattern: new RegExp('^' + escaped + '$') };
  });

export function remoteText(text: string): string {
  if (language !== 'it') return text;
  if (Object.hasOwn(italian, text)) return italian[text];
  for (const { key, indices, pattern } of remotePatterns) {
    const found = pattern.exec(text);
    if (!found) continue;
    const values = new Map(indices.map((index, i) => [index, found[i + 1]]));
    return italian[key].replace(/\{(\d+)\}/g, (_, i: string) => values.get(Number(i)) ?? '');
  }
  return text;
}
