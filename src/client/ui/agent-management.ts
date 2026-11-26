import './connections.css';
import { confirmDialog } from './prompt';
import { agentAppearancePicker } from './agent-appearance';
import { t, remoteText } from '../../shared/i18n';
import type { ConnectionsView, ConnectionFloor, CodexAccounts } from '../../shared/connections';
import type { AgentForgeView } from '../../shared/forgejo-agent';
import type { WorkerInfo } from '../../shared/protocol';
import { DESKS, WING_DESKS } from '../../shared/layout';
import { settingsApply } from './settings-apply';
import { h, STATUS_LABEL } from './dom';
import { agentFields, modelBadge } from './provider';
import { connectionRequest as request, loadConnections, connectionField as field, connectionSelect as select, connectionButton as button } from './connections-client';

function forgeFields(current?: AgentForgeView, legacy = false) {
  const tenure = select(t('Agent type'), [...(legacy && !current ? [{id:'',name:t('Choose agent type')}] : []),
    {id:'permanent',name:t('Permanent')},{id:'temporary',name:t('Temporary')}], current?.tenure ?? (legacy ? '' : 'permanent'));
  const role = select(t('Office role'), [{id:'operator',name:t('Operator')},{id:'supervisor',name:t('Lead operator')},
    {id:'chief',name:t('Office chief')}],current?.role ?? 'operator');
  return { tenure, role, fields:[field(t('Agent type'),tenure),field(t('Office role'),role)], value:() => ({tenure:tenure.value,role:role.value}) };
}
function accountLabel(account?: CodexAccounts['active']): string {
  if (!account || account === 'unknown') return t('Could not verify');
  if (account === 'stopped') return t('Container stopped');
  if (account === 'signed-out') return t('Not signed in');
  return account.method === 'api-key' ? t('OpenAI API key') : account.email ? 'ChatGPT · ' + account.email : 'ChatGPT';
}

export function agentManagementPanel(actions: HTMLElement, lazy = false) {
  let canLeave = () => true;
  let data: ConnectionsView, disposed = false, busy = false;
  let releaseForm: (() => void) | undefined;
  const resetForm = () => { releaseForm?.(); releaseForm = undefined; actions.replaceChildren(); canLeave = () => true; };
  const status = h('p.connection-status', { role: 'status' });
  const body = h('div.connection-content');
  const filter = h('input', { type: 'search', placeholder: t('Search agents in all offices'), 'aria-label': t('Search agents') }) as HTMLInputElement;
  const element = h('section.agent-management', {}, h('p.setting-note', {}, t('Manage individual agents across all offices. General office defaults remain in Workers.')),
    h('div.agent-filters', {}, filter, button(t('Refresh'), () => { if (canLeave()) void run(reload); })), status, body);
  const run = async (work: () => Promise<void>) => {
    if (busy || disposed) return; busy = true; status.className = 'connection-status'; status.textContent = t('Working…');
    try { await work(); if (!disposed) status.textContent = t('Operation completed'); }
    catch (error) { status.className = 'connection-status bad'; status.textContent = remoteText((error as Error).message); }
    finally { busy = false; }
  };
  const accountName = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? t('Not assigned');
  const bindingFor = (floor: ConnectionFloor) => data.bindings.find((b) => b.floorId === floor.id);
  async function reload() { data = await loadConnections(true); if (!disposed) list(); }
  function loginCard(shared: boolean, current: CodexAccounts['active'] | undefined, action: (operation: string, extra?: Record<string,string>) => Promise<any>) {
    const key = h('input', {type:'password',autocomplete:'off',spellcheck:false}) as HTMLInputElement;
    const feedback = h('p', {role:'status'}, accountLabel(current));
    const card = h('div.connection-card', {}, h('h4', {}, t(shared ? 'Shared Codex sign-in' : 'Codex sign-in')));
    if (shared) card.append(h('p.setting-note', {}, t('New Codex agents in every office use this account.')));
    card.append(feedback);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false, waiting = false, requestNumber = 0;
    const paint = async () => {
      clearTimeout(timer);
      const currentRequest = ++requestNumber;
      const s = await action('state');
      if (closed || currentRequest !== requestNumber) return;
      if (s.state === 'waiting' || s.state === 'busy') {
        waiting = true;
        feedback.replaceChildren();
        if (s.url && s.code) feedback.append(h('a', {href:s.url,target:'_blank',rel:'noopener noreferrer'}, t('Open ChatGPT')), ' · ', s.code);
        else feedback.textContent = t(s.state === 'busy' ? 'Another administrator is connecting Codex.' : 'Waiting for the device code…');
        timer = setTimeout(() => void paint().catch(() => {feedback.textContent=t('Connection failed');}),1500);
      } else if (s.state === 'ready') {
        feedback.textContent = s.account ? accountLabel(s.account) : t('Codex connected');
        if (shared && waiting) await reload();
      } else if (s.state === 'failed') feedback.textContent = t('Sign-in failed. Check device-code access or use an API key.');
      else if (shared && waiting) await reload();
    };
    card.append(button(t('Connect ChatGPT'), () => run(async () => { await action('device'); waiting=true; await paint(); })),
      field(t('OpenAI API key'),key), button(t('Connect API key'), () => run(async () => {
        const apiKey = key.value.trim(); key.value=''; await action('key',{apiKey}); waiting=true; await paint();
      })));
    void paint().catch(() => {if (!closed) feedback.textContent=t('Connection failed');});
    const disposePrevious = releaseForm;
    releaseForm = () => {disposePrevious?.(); closed=true; clearTimeout(timer); key.value='';};
    return card;
  }
  function list() {
    resetForm();
    if (!data) return;
    const needle = filter.value.toLowerCase();
    const rows = data.floors.flatMap((floor) => floor.workers.map((worker) => ({ floor, worker }))).filter(({ floor, worker }) => `${floor.name} ${worker.name} ${worker.model ?? ''}`.toLowerCase().includes(needle));
    const table = h('table', {}, h('thead', {}, h('tr', {}, ...['Office', 'Agent', 'Model', 'Status', 'Configured account', 'Active account', 'Properties'].map((label) => h('th', {}, t(label))))),
      h('tbody', {}, ...rows.map(({ floor, worker }) => {
        const binding = bindingFor(floor), assigned = binding?.agents[worker.id];
        const accounts = data.codexAccounts?.[worker.id];
        return h('tr', {}, h('td', {}, floor.name), h('td', {}, worker.name), h('td', {}, `${worker.provider ?? worker.kind} · ${modelBadge(worker.provider, worker.model, worker.effort) ?? t('Default')}`),
          h('td', {}, STATUS_LABEL[worker.status]), h('td', {}, worker.runtime ? accountLabel(accounts?.configured) : accountName(assigned?.accountId ?? binding?.accountId)),
          h('td', {}, worker.runtime ? accountLabel(accounts?.active) : accountName(worker.connectionAccountId)), h('td', {}, button(t('Edit properties'), () => edit(floor, worker))));
      })));
    body.replaceChildren(h('p', {}, t`Agents: ${rows.length}`), h('div.agent-table-wrap', {}, table));
    if (data.codexDocker) body.prepend(loginCard(true,data.sharedCodexAccount,(operation,extra) => request('codex-login',{operation,...extra})), button(t('Create Codex agent'), create));

  }
  function create() {
    resetForm();
    const floor = select(t('Office'), data.floors.map(f => ({ id: f.id, name: f.name })));
    const appearance = agentAppearancePicker();
    const forge = forgeFields();
    releaseForm = appearance.dispose;
    const label = h('input', { maxlength: 80, placeholder: t('Office name') }) as HTMLInputElement;
    body.replaceChildren(button(t('Back to all agents'), list), h('h3', {}, t('Create Codex agent')));
    if (!data.floors.length) {
      body.append(field(t('Office name'), label), button(t('Create local office'), () => run(async () => {
        await request('container-office', { name: label.value }); await reload(); create();
      })));
      return;
    }
    const engine = agentFields({ ...data.floors[0].project, agentProviders: ['codex'] }, 'create-codex', { provider: 'codex' });
    const prompt = h('textarea', { maxlength: 20000, rows: 3 }) as HTMLTextAreaElement;
    body.append(field(t('Office'), floor), ...forge.fields, engine.element, field(t('Initial instructions'), prompt), appearance.element,
      h('p.setting-note', {}, t('The agent starts at a free desk with a private copy of the committed project.')),
      button(t('Create Codex agent'), () => run(async () => {
        if (!engine.valid()) throw Error(t('Check the engine fields'));
        const { model, effort } = engine.choice();
        const result = await request('container-create', { floorId: floor.value, assignment: forge.value(), model, effort, prompt: prompt.value.trim() || undefined, appearance: appearance.value() });
        const id = floor.value;
        await reload();
        const f = data.floors.find(f => f.id === id);
        const w = f?.workers.find(w => w.id === result.workerId);
        if (f && w) edit(f, w);
      })));
  }
  function edit(floor: ConnectionFloor, worker: WorkerInfo) {
    resetForm();
    const name = h('input', { value: worker.name, maxlength: 100 }) as HTMLInputElement;
    const color = h('input', { type: 'color', value: worker.color }) as HTMLInputElement;
    const look = worker.runtime === 'docker' ? agentAppearancePicker(worker.appearance) : undefined;
    if (look) releaseForm = look.dispose;
    const seats = [...DESKS, ...WING_DESKS].filter((d) => !d.station && !d.room).map((d) => ({ id: d.id, name: d.label }));
    if (!seats.some((d) => d.id === worker.deskId)) seats.push({ id: worker.deskId, name: worker.deskId });
    const desk = select(t('Desk'), seats, worker.deskId);
    const engine = agentFields(worker.runtime === 'docker' ? { ...floor.project, agentProviders: ['codex'] } : floor.project, 'manage-' + worker.id, { provider: worker.provider ?? 'custom', model: worker.model, effort: worker.effort });
    const prompt = h('textarea', { maxlength: 20000, rows: 8 }, worker.prompt ?? '') as HTMLTextAreaElement;
    const restart = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const dockerNote = h('p.setting-note', { role: 'status' });
    const paintDockerNote = (current: WorkerInfo) => {
      const active = current.containerEngine;
      const pending = active && (active.model !== current.model || active.effort !== current.effort);
      dockerNote.textContent = pending && !current.paused
        ? t('Model and effort saved. They take effect when this agent can safely resume its chat.')
        : t('Model and effort are saved immediately. Initial instructions are used when a new chat starts.');
    };
    paintDockerNote(worker);
    const props = h('div.connection-card', {}, h('h4', {}, t('Editable properties')), field(t('Name'), name), field(t('Color'), color), field(t('Desk'), desk),
      look?.element ?? null, worker.kind === 'agent' ? engine.element : h('p', {}, t('Shared shell')), field(t('Initial instructions'), prompt),
      worker.runtime === 'docker' ? dockerNote : h('label', {}, restart, ' ', t('Start a new session to apply engine or instruction changes. Previous terminal history is retained.')),
      worker.runtime === 'docker' ? null : h('p.setting-note', {}, t('A working agent or one waiting for an answer cannot be restarted here.')));
    const apply = settingsApply(lock => { element.inert = lock; });
    canLeave = apply.canDismiss;
    const configuration = () => ({
      name: name.value, color: color.value, deskId: desk.value,
      ...(worker.kind === 'agent' ? engine.choice() : {}), prompt: prompt.value || undefined,
      ...(look ? { appearance: look.value() ?? 'random' } : {}), restart: restart.checked,
    });
    let saved = JSON.stringify(configuration());
    apply.add({
      dirty: () => JSON.stringify(configuration()) !== saved,
      validate: () => { if (worker.kind === 'agent' && !engine.valid()) throw Error(t('Check the engine fields')); },
      apply: async () => {
        const result = await request('worker', { floorId: floor.id, workerId: worker.id, configuration: configuration() });
        if (worker.runtime && result.worker) paintDockerNote(result.worker);
        restart.checked = false;
        saved = JSON.stringify(configuration());
      },
    });
    for (const event of ['input', 'change', 'click']) props.addEventListener(event, apply.refresh);
    const binding = bindingFor(floor);
    const identity = h('div.connection-card', {}, h('h4', {}, t('Repository identity')));
    if (worker.runtime === 'docker') {
      let current = data.forgeAccounts?.[worker.id];
      const forge = forgeFields(current,true);
      const note = h('p',{role:'status'});
      const retry = button(t('Retry Forgejo access'), () => run(async () => {
        if (!current) return;
        await saveForge({tenure:current.tenure,role:current.role});
      }));
      const paint = () => {
        note.textContent = current?.status === 'ready' ? current.username + ' · ' + current.repository :
          current?.status === 'pending' ? t('Forgejo access pending') + ' · ' + (current.error ?? '') :
          current ? t('No personal Forgejo access') : t('Choose the type and role for this existing agent');
        retry.hidden = current?.status !== 'pending';
      };
      const saveForge = async (assignment: {tenure:string;role:string}) => {
        const result = await request('agent-forge', {floorId:floor.id, workerId:worker.id,assignment});
        current = result.access;
        (data.forgeAccounts ??= {})[worker.id] = result.access;
        paint();
      };
      let savedForge = JSON.stringify(forge.value());
      apply.add({dirty:() => savedForge !== JSON.stringify(forge.value()),
        validate:() => { if (!forge.tenure.value) throw Error(t('Choose agent type')); },
        apply:async () => { await saveForge(forge.value()); savedForge = JSON.stringify(forge.value()); }});
      forge.tenure.addEventListener('change',apply.refresh); forge.role.addEventListener('change',apply.refresh);
      identity.append(...forge.fields,note,retry); paint();
    } else if (binding) {
      const serverId = data.accounts.find((a) => a.id === binding.accountId)?.serverId;
      const assigned = binding.agents[worker.id];
      const account = select(t('Specific account'), [{ id: '', name: t('Use the office account') }, ...data.accounts.filter((a) => a.serverId === serverId && a.verifiedAt)], assigned?.accountId);
      const effective = h('p');
      const paint = () => { effective.textContent = t`Effective on next session: ${accountName(account.value || binding.accountId)}`; };
      account.addEventListener('change', paint); paint();
      let savedAccount = account.value;
      account.addEventListener('change', apply.refresh);
      apply.add({
        dirty: () => account.value !== savedAccount,
        apply: async () => {
          const latest = (await loadConnections()).bindings.find(b => b.floorId === floor.id);
          if (!latest) throw new Error(t('Connect this office to a repository in GitHub and Forgejo first.'));
          await request('bind', { ...latest, agents: { ...latest.agents, [worker.id]: { accountId: account.value || undefined } } });
          savedAccount = account.value;
        },
      });
      identity.append(field(t('Specific account'), account), effective, h('p', {}, t`Active account: ${accountName(worker.connectionAccountId)}`),
        h('p.setting-note', {}, t('Changing this assignment does not replace credentials inside an already running session.')));
    } else identity.append(h('p', {}, t('Connect this office to a repository in GitHub and Forgejo first.')));
    const details = h('details.connection-card', {}, h('summary', {}, t('Read-only runtime properties')), h('dl', {}, ...[
      [t('Identifier'), worker.id], [t('Office'), floor.name], [t('Type'), worker.kind], [t('Status'), STATUS_LABEL[worker.status]], [t('Session'), worker.sessionId ?? '—'],
      [t('Worktree'), worker.worktree?.path ?? '—'], [t('Branch'), worker.worktree?.branch ?? floor.project.branch ?? '—'], [t('Created by'), worker.createdBy], [t('Activity'), worker.activity ?? '—'],
    ].flatMap(([key, value]) => [h('dt', {}, key), h('dd', {}, value)])));
    body.replaceChildren(button(t('Back to all agents'), () => { if (canLeave()) void run(reload); }), h('h3', {}, floor.name + ' · ' + worker.name), props, identity, details);
    if (worker.runtime === 'docker') {
      const action = (operation: string, extra = {}) => request('container', { floorId: floor.id, workerId: worker.id, operation, ...extra });
      const stopped = worker.paused || ['exited', 'offline'].includes(worker.status);
      const control = h('div.connection-card', {}, h('h4', {}, 'Docker'), h('p', {}, STATUS_LABEL[worker.status]),
        button(stopped ? t('Start container') : t('Stop container'), () => { if (canLeave()) void run(async () => { await action(stopped ? 'start' : 'stop'); await reload(); }); }),
        button(t('Remove agent'), () => confirmDialog(t('Remove agent?'), t('The private checkout is retained. Its Codex sign-in and session history will be removed.'), t('Remove'), () => void run(async () => { await action('remove'); await reload(); }))));
      body.append(control);
      if (worker.sharedCodexLogin) body.append(h('p.setting-note',{},t('Shared Codex sign-in')+' · '+accountLabel(data.sharedCodexAccount)));
      else if (!stopped) body.append(loginCard(false,data.codexAccounts?.[worker.id]?.active,(op,extra) => action('login-'+op,extra)));
    }
    actions.replaceChildren(apply.element);
  }
  filter.addEventListener('input', () => {
    if (!canLeave()) return;
    if (actions.childElementCount) void run(reload);
    else list();
  });
  const load = () => { if (!data && !busy) void run(reload); };
  if (!lazy) load();
  return { element, load, canDismiss: () => canLeave(), dispose() { disposed = true; resetForm(); } };
}
