import { t } from '../../shared/i18n';
import type { ConnectionsView } from '../../shared/connections';
import { h } from './dom';

export async function connectionRequest<T = any>(action?: string, input: Record<string, unknown> = {}, query = ''): Promise<T> {
  const response = await fetch('/api/connections' + query, action ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, action }) } : { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? t('Connection failed'));
  return result;
}
export const loadConnections = (agents = false) => connectionRequest<ConnectionsView>(undefined, {}, agents ? '?agents=1' : '');
export function connectionField(label: string, control: HTMLElement): HTMLElement { return h('label.connection-field', {}, h('span', {}, label), control); }
export function connectionSelect(label: string, values: { id: string; name: string }[], selected = ''): HTMLSelectElement {
  return h('select', { 'aria-label': label }, ...values.map((v) => h('option', { value: v.id, selected: v.id === selected }, v.name))) as HTMLSelectElement;
}
export function connectionButton(label: string, run: () => void | Promise<void>, cls = ''): HTMLButtonElement {
  const button = h('button.btn', { type: 'button', class: cls }, label);
  button.addEventListener('click', () => void run()); return button;
}
