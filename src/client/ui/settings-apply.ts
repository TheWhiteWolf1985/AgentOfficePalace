import { t } from '../../shared/i18n';
import type { ClientMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { store, type Topic } from '../state';
import { h } from './dom';

interface Change {
  dirty(): boolean;
  apply(): void | Promise<void>;
  validate?(): void;
}

/** General settings keep their drafts across tabs. Only confirmed changes leave this list. */
export function settingsApply(lock: (busy: boolean) => void = () => {}) {
  const changes: Change[] = [];
  const dirty = () => changes.some(c => c.dirty());
  const status = h('span', { role: 'status' });
  const button = h('button.btn.primary', { type: 'button', disabled: true }, t('Apply'));
  const element = h('footer.settings-apply', {}, status, button);
  let busy = false;
  const refresh = () => {
    if (busy) return;
    button.disabled = !dirty();
    status.textContent = button.disabled ? '' : t('Unapplied changes');
  };
  button.addEventListener('click', async () => {
    if (busy || !dirty()) return;
    busy = true;
    lock(true);
    button.disabled = true;
    status.textContent = t('Saving…');
    try {
      const pending = changes.filter(c => c.dirty());
      for (const c of pending) c.validate?.();
      for (const c of pending) if (c.dirty()) await c.apply();
      status.textContent = t('Settings applied');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : t('Could not apply settings');
    } finally {
      busy = false;
      lock(false);
      button.disabled = !dirty();
    }
  });
  return { element, refresh, sync: () => { if (dirty() === button.disabled) refresh(); }, add: (change: Change) => { changes.push(change); },
    canDismiss: () => !busy && (!dirty() || window.confirm(t('Discard unapplied changes?'))) };
}

/** Shared settings are confirmed by the server's authoritative state broadcast. */
export function confirmSetting(net: Net, message: ClientMsg, topic: Topic, matches: () => boolean) {
  if (!net.up) throw new Error(t('Connection failed'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(t('The server did not confirm this setting. Check the value and retry.'))); }, 6000);
    const off = store.on(topic, () => {
      if (!matches()) return;
      clearTimeout(timer);
      off();
      resolve();
    });
    net.send(message);
  });
}
