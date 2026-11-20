import './language.css';
import { chooseLanguage, getLanguage, t } from '../i18n';
import { settingsApply } from './settings-apply';
import { h, openModal } from './dom';
import { connectionsPanel } from './connections';
import { agentManagementPanel } from './agent-management';

export function languageSelect(onChange: (language: string) => void): HTMLSelectElement {
  return h('select.language-select', { 'aria-label': t('Language'), onchange: (event: Event) => onChange((event.target as HTMLSelectElement).value) },
    h('option', { value: 'it', selected: getLanguage() === 'it' }, 'Italiano'),
    h('option', { value: 'en', selected: getLanguage() === 'en' }, 'English'));
}

/** The lite view has no 3D settings panel, but shares the same language choice. */
export function openLanguageSettings(): void {
  const body = h('div.body');
  const apply = settingsApply();
  const language = languageSelect(apply.refresh);
  apply.add({ dirty: () => language.value !== getLanguage(), apply: () => chooseLanguage(language.value) });
  let panel: { element: HTMLElement; dispose(): void; canDismiss?(): boolean } | undefined;
  const show = (kind: 'language' | 'connections' | 'management') => {
    if (panel?.canDismiss && !panel.canDismiss()) return;
    apply.element.hidden = kind !== 'language';
    panel?.dispose(); panel = undefined;
    if (kind === 'language') body.replaceChildren(h('label', {}, t('Language'), language), h('p.setting-note', {}, t('Changing language reloads this page. Your agents keep working.')));
    else { panel = kind === 'connections' ? connectionsPanel() : agentManagementPanel(); body.replaceChildren(panel.element); }
  };
  const nav = h('nav.connection-tabs', {}, ...([['language', 'Language'], ['management', 'Agent management'], ['connections', 'GitHub and Forgejo']] as const).map(([key, label]) => {
    const button = h('button.btn', { type: 'button', onclick: () => show(key) }, t(label)); return button;
  }));
  show('language');
  openModal(h('div.modal.language-settings', { role: 'dialog', 'aria-label': t('Settings'), style: 'width:min(1000px,calc(100vw - 32px))' }, h('header', {}, h('h2', {}, t('⚙️ Settings'))), nav, body, apply.element),
    { canDismiss: () => (panel?.canDismiss?.() ?? true) && apply.canDismiss(), doing: t('⚙️ in settings'), onClose: () => panel?.dispose() });
}
