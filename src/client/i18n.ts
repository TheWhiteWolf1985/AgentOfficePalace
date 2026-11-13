import { getLanguage, isLanguage, setLanguage, t, type Language } from '../shared/i18n';
import './ui/language.css';
export { t, getLanguage, languageTag } from '../shared/i18n';

export const LANGUAGE_KEY = 'agent-office.language';

export function savedLanguage(storage: Pick<Storage, 'getItem'> | undefined, query: string): Language {
  const requested = new URLSearchParams(query).get('lang');
  if (isLanguage(requested)) return requested;
  try { const saved = storage?.getItem(LANGUAGE_KEY); if (isLanguage(saved)) return saved; } catch { /* Storage may be disabled. */ }
  return 'it';
}

/** Runs before the entry point: only the authored, initial HTML is visited.
 * There is deliberately no observer and no translation of live user content. */
export function translateInitialDocument(root: Document): void {
  root.documentElement.lang = getLanguage();
  const walker = root.createTreeWalker(root.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,pre,code,textarea')) continue;
    const original = node.textContent ?? '';
    const key = original.trim();
    if (key) node.textContent = original.replace(key, t(key));
  }
  for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) {
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, t(value));
    }
  }
  root.title = t(root.title);
}

export function chooseLanguage(value: string): void {
  if (!isLanguage(value) || value === getLanguage()) return;
  const url = new URL(location.href);
  try { localStorage.setItem(LANGUAGE_KEY, value); url.searchParams.delete('lang'); }
  catch { url.searchParams.set('lang', value); }
  history.replaceState(null, '', url.href);
  location.reload();
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  let storage: Storage | undefined;
  try { storage = localStorage; } catch { /* Private/restricted browser. */ }
  setLanguage(savedLanguage(storage, location.search));
  translateInitialDocument(document);
  if (['/login', '/join', '/claim'].some((path) => location.pathname.startsWith(path))) {
    const label = document.createElement('label');
    label.className = 'language-choice';
    label.append(t('Language'), ' ');
    const select = document.createElement('select');
    select.className = 'language-select';
    select.setAttribute('aria-label', t('Language'));
    for (const [value, name] of [['it', 'Italiano'], ['en', 'English']]) {
      const option = document.createElement('option');
      option.value = value; option.textContent = name; option.selected = value === getLanguage();
      select.append(option);
    }
    select.addEventListener('change', () => chooseLanguage(select.value));
    label.append(select);
    document.querySelector('main.card')?.append(label);
  }
}
