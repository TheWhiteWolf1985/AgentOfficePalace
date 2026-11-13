import './language.css';
import { chooseLanguage, getLanguage, t } from '../i18n';
import { h, openModal } from './dom';

export function languageSelect(): HTMLSelectElement {
  return h('select.language-select', { 'aria-label': t('Language'), onchange: (event: Event) => chooseLanguage((event.target as HTMLSelectElement).value) },
    h('option', { value: 'it', selected: getLanguage() === 'it' }, 'Italiano'),
    h('option', { value: 'en', selected: getLanguage() === 'en' }, 'English'));
}

/** The lite view has no 3D settings panel, but shares the same language choice. */
export function openLanguageSettings(): void {
  openModal(h('div.modal.language-settings', { role: 'dialog', 'aria-label': t('Settings') },
    h('header', {}, h('h2', {}, t('⚙️ Settings'))),
    h('div.body', {}, h('label', {}, t('Language'), languageSelect()),
      h('p.setting-note', {}, t('Changing language reloads this page. Your agents keep working.')))),
  { doing: t('⚙️ in settings') });
}
