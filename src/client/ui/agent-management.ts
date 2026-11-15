import './connections.css';
import { t, remoteText } from '../../shared/i18n';
import type { ConnectionsView, ConnectionFloor } from '../../shared/connections';
import type { WorkerInfo } from '../../shared/protocol';
import { DESKS, WING_DESKS } from '../../shared/layout';
import { h, STATUS_LABEL } from './dom';
import { agentFields } from './provider';
import { connectionRequest as request, loadConnections, connectionField as field, connectionSelect as select, connectionButton as button } from './connections-client';

export function agentManagementPanel(): { element: HTMLElement; dispose(): void } {
  let data: ConnectionsView, disposed = false, busy = false;
  const status = h('p.connection-status', { role: 'status' });
  const body = h('div.connection-content');
  const filter = h('input', { type: 'search', placeholder: t('Search agents in all offices'), 'aria-label': t('Search agents') }) as HTMLInputElement;
  const element = h('section.agent-management', {}, h('p.setting-note', {}, t('Manage individual agents across all offices. General office defaults remain in Workers.')),
    h('div.agent-filters', {}, filter, button(t('Refresh'), () => run(reload))), status, body);
  const run = async (work: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; status.className = 'connection-status'; status.textContent = t('Working…');
    try { await work(); if (!disposed) status.textContent = t('Operation completed'); }
    catch (error) { status.className = 'connection-status bad'; status.textContent = remoteText((error as Error).message); }
    finally { busy = false; }
  };
  const accountName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? t('Not assigned');
  const bindingFor = (floor: ConnectionFloor) => data.bindings.find((b) => b.floorId === floor.id);
  async function reload() { data = await loadConnections(); if (!disposed) list(); }
  function list() {
    if (!data) return;
    const needle = filter.value.toLowerCase();
    const rows = data.floors.flatMap((floor) => floor.workers.map((worker) => ({ floor, worker }))).filter(({ floor, worker }) => `${floor.name} ${worker.name} ${worker.model ?? ''}`.toLowerCase().includes(needle));
    const table = h('table', {}, h('thead', {}, h('tr', {}, ...['Office', 'Agent', 'Model', 'Status', 'Configured account', 'Active account', 'Properties'].map((label) => h('th', {}, t(label))))),
      h('tbody', {}, ...rows.map(({ floor, worker }) => {
        const binding = bindingFor(floor), assigned = binding?.agents[worker.id];
        return h('tr', {}, h('td', {}, floor.name), h('td', {}, worker.name), h('td', {}, `${worker.provider ?? worker.kind} · ${worker.model ?? t('Default')}`),
          h('td', {}, STATUS_LABEL[worker.status]), h('td', {}, accountName(assigned?.accountId ?? binding?.accountId)), h('td', {}, accountName(worker.connectionAccountId)), h('td', {}, button(t('Edit properties'), () => edit(floor, worker))));
      })));
    body.replaceChildren(h('p', {}, t`Agents: ${rows.length}`), h('div.agent-table-wrap', {}, table));

  }
  function edit(floor: ConnectionFloor, worker: WorkerInfo) {
    const name = h('input', { value: worker.name, maxlength: 100 }) as HTMLInputElement;
    const color = h('input', { type: 'color', value: worker.color }) as HTMLInputElement;
    const seats = [...DESKS, ...WING_DESKS].filter((d) => !d.station && !d.room).map((d) => ({ id: d.id, name: d.label }));
    if (!seats.some((d) => d.id === worker.deskId)) seats.push({ id: worker.deskId, name: worker.deskId });
    const desk = select(t('Desk'), seats, worker.deskId);
    const engine = agentFields(floor.project, 'manage-' + worker.id, { provider: worker.provider ?? 'custom', model: worker.model, effort: worker.effort });
    const prompt = h('textarea', { maxlength: 20000, rows: 8 }, worker.prompt ?? '') as HTMLTextAreaElement;
    const restart = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const props = h('div.connection-card', {}, h('h4', {}, t('Editable properties')), field(t('Name'), name), field(t('Color'), color), field(t('Desk'), desk),
      worker.kind === 'agent' ? engine.element : h('p', {}, t('Shared shell')), field(t('Initial instructions'), prompt),
      h('label', {}, restart, ' ', t('Start a new session to apply engine or instruction changes. Previous terminal history is retained.')),
      h('p.setting-note', {}, t('A working agent or one waiting for an answer cannot be restarted here.')),
      button(t('Save properties'), () => run(async () => {
        if (worker.kind === 'agent' && !engine.valid()) throw Error(t('Check the engine fields'));
        const configuration = { name: name.value, color: color.value, deskId: desk.value, ...(worker.kind === 'agent' ? engine.choice() : {}), prompt: prompt.value || undefined, restart: restart.checked };
        await request('worker', { floorId: floor.id, workerId: worker.id, configuration }); await reload();
      })));
    const binding = bindingFor(floor);
    const identity = h('div.connection-card', {}, h('h4', {}, t('Repository identity')));
    if (binding) {
      const serverId = data.accounts.find((a) => a.id === binding.accountId)?.serverId;
      const assigned = binding.agents[worker.id];
      const account = select(t('Specific account'), [{ id: '', name: t('Use the office account') }, ...data.accounts.filter((a) => a.serverId === serverId && a.verifiedAt)], assigned?.accountId);
      const effective = h('p');
      const paint = () => { effective.textContent = t`Effective on next session: ${accountName(account.value || binding.accountId)}`; };
      account.addEventListener('change', paint); paint();
      identity.append(field(t('Specific account'), account), effective, h('p', {}, t`Active account: ${accountName(worker.connectionAccountId)}`),
        button(t('Save identity assignment'), () => run(async () => { await request('bind', { ...binding, agents: { ...binding.agents, [worker.id]: { accountId: account.value || undefined } } }); await reload(); })),
        h('p.setting-note', {}, t('Changing this assignment does not replace credentials inside an already running session.')));
    } else identity.append(h('p', {}, t('Connect this office to a repository in GitHub and Forgejo first.')));
    const details = h('details.connection-card', {}, h('summary', {}, t('Read-only runtime properties')), h('dl', {}, ...[
      [t('Identifier'), worker.id], [t('Office'), floor.name], [t('Type'), worker.kind], [t('Status'), STATUS_LABEL[worker.status]], [t('Session'), worker.sessionId ?? '—'],
      [t('Worktree'), worker.worktree?.path ?? '—'], [t('Branch'), worker.worktree?.branch ?? floor.project.branch ?? '—'], [t('Created by'), worker.createdBy], [t('Activity'), worker.activity ?? '—'],
    ].flatMap(([key, value]) => [h('dt', {}, key), h('dd', {}, value)])));
    body.replaceChildren(button(t('Back to all agents'), () => list()), h('h3', {}, floor.name + ' · ' + worker.name), props, identity, details);
  }
  filter.addEventListener('input', list);
  void run(reload);
  return { element, dispose() { disposed = true; } };
}
