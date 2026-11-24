import type { UpdateStatus } from '../../shared/software-updates';
import { getLanguage } from '../i18n';
import { store } from '../state';
import { h } from './dom';
import './software-updates.css';

const tr = (it: string, en: string) => getLanguage() === 'it' ? it : en;
export const updatesTitle = () => tr('Aggiornamenti', 'Updates');
const pendingKey = 'agent-office.update-request';
const running = (s: UpdateStatus) => ['waiting', 'preparing', 'activating'].includes(s.job?.phase ?? '');

async function query(body?: object): Promise<UpdateStatus> {
  const r = await fetch('/api/software-updates', {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    throw Error(error.error || tr('Connessione temporaneamente non disponibile.', 'Connection temporarily unavailable.'));
  }
  return r.json();
}

export function updatesPanel() {
  const element = h('div.software-updates');
  const message = h('p', { role: 'status', 'aria-live': 'polite' });
  const details = h('div');
  element.append(message, details);
  let timer = 0, active = false, epoch = 0, sending = false;
  const button = (label: string, action: () => void, primary = false) =>
    h(primary ? 'button.btn.primary' : 'button.btn', { type: 'button', onclick: action }, label);

  async function refresh(command?: object, wanted?: string) {
    if (!active || sending) return;
    sending = true;
    const generation = epoch;
    clearTimeout(timer);
    if (command) details.querySelectorAll('button,select').forEach(el => (el as HTMLButtonElement).disabled = true);
    let delay = 30000;
    try {
      const state = await query(command);
      if (!active || generation !== epoch) return;
      details.replaceChildren();
      if (!state.managed) {
        message.textContent = tr('Questa istanza viene aggiornata dal repository di sviluppo.', 'This instance is updated from its development repository.');
        return;
      }
      if (wanted) sessionStorage.setItem(pendingKey, wanted);
      const working = running(state);
      const target = state.job?.tag ?? '';
      const text = {
        waiting: state.busy ? tr('In attesa degli agenti impegnati', 'Waiting for busy agents') + ' (' + state.busy + ')' : tr('Aggiornamento in attesa di avvio', 'Update queued'),
        preparing: tr('Download e verifica del pacchetto', 'Downloading and verifying the package'),
        activating: tr('Riavvio di Office', 'Restarting Office'),
        done: tr('Aggiornamento completato', 'Update complete'),
        failed: tr('Aggiornamento non riuscito. Controlla la versione attiva e riprova.', 'Update failed. Check the active version and try again.'),
      };
      message.textContent = state.job?.phase ? text[state.job.phase] + ' · ' + target : '';
      if (state.job?.phase === 'done' && state.current === sessionStorage.getItem(pendingKey)) {
        sessionStorage.removeItem(pendingKey);
        sessionStorage.setItem('agent-office.update-completed', state.current);
        location.reload();
        return;
      }
      if (state.job?.phase === 'failed') sessionStorage.removeItem(pendingKey);
      details.append(h('p', {}, tr('Versione installata', 'Installed version') + ' · ', h('strong', {}, state.current ?? '')));
      const select = h('select', { 'aria-label': tr('Canale aggiornamenti', 'Update channel'), disabled: working,
        onchange: (e: Event) => void refresh({ action: 'channel', channel: (e.target as HTMLSelectElement).value }) },
        h('option', { value: 'stable', selected: state.channel === 'stable' }, tr('Stabile', 'Stable')),
        h('option', { value: 'preview', selected: state.channel === 'preview' }, tr('Stabile e versioni di prova (RC)', 'Stable and release candidates')));
      details.append(h('label', {}, tr('Canale aggiornamenti', 'Update channel'), select));
      if (working) { delay = 2500; return; }
      if (state.error) details.append(h('p', { role: 'alert' }, state.error));
      if (state.available) {
        const release = state.available;
        details.append(h('h4', {}, tr('Versione disponibile', 'Available version') + ' · ' + release.tag));
        if (release.notes) details.append(h('p.release-notes', {}, release.notes));
        if (!state.error) details.append(button(state.busy ? tr('Aggiorna al termine dei task', 'Update when tasks finish') : tr('Aggiorna', 'Update'),
          () => void refresh({ action: 'apply', tag: release.tag }, release.tag), true));
      } else if (!state.error) details.append(h('p', {}, tr('Hai già la versione più recente per questo canale.', 'You have the latest version for this channel.')));
      details.append(button(tr('Controlla aggiornamenti', 'Check for updates'), () => void refresh({ action: 'check' })));
    } catch (err) {
      if (active && generation === epoch) {
        message.textContent = sessionStorage.getItem(pendingKey) ? tr('Attendo la riconnessione a Office…', 'Reconnecting to Office…') : String((err as Error).message);
        delay = 4000;
      }
    } finally {
      if (generation === epoch) {
        sending = false;
        if (active && element.isConnected) timer = window.setTimeout(() => void refresh(), delay);
      }
    }
  }
  function dispose() { active = false; sending = false; epoch++; clearTimeout(timer); }
  function load() { dispose(); active = true; message.textContent = tr('Controllo della versione…', 'Checking version…'); void refresh(); }
  return { element, load, dispose };
}

/** One light check per visible client interval; the host shares its GitHub cache across all clients. */
export function watchUpdates(open: () => void) {
  let badge: HTMLElement | undefined, last = 0, checking = false, seen = '';
  async function check() {
    if (!store.me.admin) { badge?.remove(); badge = undefined; last = 0; return; }
    if (checking || document.hidden || Date.now() - last < 60000) return;
    checking = true; last = Date.now();
    try {
      const s = await query();
      const done = sessionStorage.getItem('agent-office.update-completed');
      const installed = sessionStorage.getItem(pendingKey);
      let label = '';
      if (s.current && s.current === installed && s.job?.phase === 'done') {
        sessionStorage.removeItem(pendingKey); sessionStorage.setItem('agent-office.update-completed', s.current); location.reload(); return;
      }
      if (s.managed && s.current === done && done) label = tr('Office aggiornato a ', 'Office updated to ') + done;
      else if (s.managed && s.available && !running(s)) label = tr('È disponibile ', 'Update available: ') + s.available.tag;
      if (!label || !store.me.admin || seen === label) { badge?.remove(); badge = undefined; return; }
      if (badge?.textContent === label) return;
      badge?.remove();
      badge = h('button.btn.office-update-badge', { type: 'button', onclick: () => {
        seen = label; sessionStorage.removeItem('agent-office.update-completed'); badge?.remove(); open();
      } }, label);
      const liteMain = document.querySelector('body.lite .lite-main');
      if (liteMain) liteMain.prepend(badge);
      else document.body.append(badge);
    } catch { /* Try again when the tab regains focus or at the next interval. */ }
    finally { checking = false; }
  }
  store.on('me', check);
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  window.setInterval(check, 300000);
  void check();
}
