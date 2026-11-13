import './language.css';
import { chooseLanguage, getLanguage, t } from '../i18n';
import { h, openModal } from './dom';
import { connectionsPanel } from './connections';
import { agentManagementPanel } from './agent-management';

export function languageSelect(): HTMLSelectElement {
  return h('select.language-select', { 'aria-label': t('Language'), onchange: (event: Event) => chooseLanguage((event.target as HTMLSelectElement).value) },
    h('option', { value: 'it', selected: getLanguage() === 'it' }, 'Italiano'),
    h('option', { value: 'en', selected: getLanguage() === 'en' }, 'English'));
}

/** The lite view has no 3D settings panel, but shares the same language choice. */
export function openLanguageSettings(): void {
  const body = h('div.body');
  let panel: { element: HTMLElement; dispose(): void } | undefined;
  const show = (kind: 'language' | 'connections' | 'management') => {
    panel?.dispose(); panel = undefined;
    if (kind === 'language') body.replaceChildren(h('label', {}, t('Language'), languageSelect()), h('p.setting-note', {}, t('Changing language reloads this page. Your agents keep working.')));
    else { panel = kind === 'connections' ? connectionsPanel() : agentManagementPanel(); body.replaceChildren(panel.element); }
  };
  const nav = h('nav.connection-tabs', {}, ...([['language', 'Language'], ['management', 'Agent management'], ['connections', 'GitHub and Forgejo']] as const).map(([key, label]) => {
    const button = h('button.btn', { type: 'button', onclick: () => show(key) }, t(label)); return button;
  }));
  show('language');
  openModal(h('div.modal.language-settings', { role: 'dialog', 'aria-label': t('Settings'), style: 'width:min(1000px,calc(100vw - 32px))' }, h('header', {}, h('h2', {}, t('⚙️ Settings'))), nav, body),
    { doing: t('⚙️ in settings'), onClose: () => panel?.dispose() });
}
