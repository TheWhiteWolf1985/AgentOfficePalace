import { t as uiText } from '../../shared/i18n';
import './hud.css';
import { h, openModal } from './dom';
import { HELP_ROWS } from './help';

export function openHelp() {
  const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': uiText('Controls') },
    h('header', {}, h('h2', {}, uiText('🎮 Controls')), close),
    h('div.body', {}, h('div.help-grid', {}, ...HELP_ROWS.flatMap(([k, v]) => [h('span.key', {}, k), h('span', {}, v)]))),
  );
  const modal = openModal(el);
  close.addEventListener('click', () => modal.close());
}
