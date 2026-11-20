import { t as uiText } from '../../shared/i18n';
import './queue.css';
import type { AgentProvider, QueueTask, Usage } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, timeAgo, STATUS_LABEL } from './dom';
import { confirmDialog } from './prompt';
import { providerPicker, providerLabel, providerUsageState, providerWaitingLabel, resolvedProvider, modelBadge } from './provider';
import { officeFull } from '../../shared/machine';
import { dictateField } from './dictate';

export interface QueueActions {
  openTerminal(workerId: string): void;
}

/** The queue task's name, linked to its GitHub issue when it has one. */
function taskTitle(t: QueueTask): HTMLElement {
  if (t.issue === undefined) return h('div.queue-title', { title: t.prompt }, t.title);
  const issue = store.issues.items.find((i) => i.number === t.issue);
  const text = t.title.startsWith(`#${t.issue}`) ? t.title : `#${t.issue} ${t.title}`;
  return h('div.queue-title', { title: t.prompt }, issue ? h('a', { href: issue.url, target: '_blank', rel: 'noopener' }, text) : text);
}

function outcome(t: QueueTask): string {
  switch (t.outcome) {
    case 'done':
      return t.pr ? 'finished' : uiText('finished, no PR found yet');
    case 'exited':
      return t.error ? uiText`stopped: ${t.error}` : uiText('stopped before finishing');
    case 'killed':
      return uiText('sent home');
    case 'failed':
      return uiText`couldn't start: ${t.error ?? uiText('unknown error')}`;
    default:
      return '';
  }
}

export function openQueue(net: Net, actions: QueueActions) {
  const body = h('div.body.queue');
  const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
  const limitValue = h('b');
  const minus = h('button.btn', { type: 'button', title: uiText('Fewer workers at once'), 'aria-label': uiText('Fewer workers at once') }, '−');
  const plus = h('button.btn', { type: 'button', title: uiText('More workers at once'), 'aria-label': uiText('More workers at once') }, '+');
  const limit = h('div.queue-limit', { title: uiText('How many workers the queue keeps busy at once. 0 pauses it.') }, uiText('Workers at once'), minus, limitValue, plus);
  minus.addEventListener('click', () => net.send({ t: 'queue.limit', maxWorkers: store.queue.maxWorkers - 1 }));
  plus.addEventListener('click', () => net.send({ t: 'queue.limit', maxWorkers: store.queue.maxWorkers + 1 }));
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': uiText('Task queue'), style: 'width:min(800px,100%)' },
    h('header', {}, h('h2', {}, uiText('📋 Task queue')), limit, close),
    body,
    h('footer', {}, h('span.grow', {}, uiText('The queue keeps going while you are away. Set “workers at once” to 0 to pause it.'))),
  );

  const ta = h('textarea', { rows: 2, placeholder: uiText('Describe a task for the next free worker…'), 'aria-label': uiText('New task') }) as HTMLTextAreaElement;
  const provider = providerPicker(store.project, 'queue-provider');
  const target = document.createElement('select');
  target.setAttribute('aria-label', uiText('Assign to'));
  target.onchange = () => { provider.element.hidden = !!target.value; };
  const addBtn = h('button.btn.primary', { type: 'submit' }, uiText('Add to queue'));
  const form = h('form.queue-add', {}, dictateField(ta), target, provider.element, addBtn) as HTMLFormElement;
  form.noValidate = true;
  const submit = () => {
    const text = ta.value.trim();
    if (!text) {
      ta.focus();
      return;
    }
    if (!target.value && !provider.valid()) return;
    const custom = !target.value && provider.customized();
    net.send({ t: 'queue.add', prompt: text, targetWorkerId: target.value || undefined, provider: target.value ? store.workers.get(target.value)?.provider : custom ? provider.value() : undefined, model: custom ? provider.model() : undefined, effort: custom ? provider.effort() : undefined });
    ta.value = '';
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  const section = (title: string, tasks: QueueTask[], extra?: HTMLElement) => {
    if (!tasks.length) return null;
    return h('div', {}, h('h4', {}, title, h('span.count', {}, String(tasks.length)), extra ?? null), h('ul.queue-list', {}, ...tasks.map(row)));
  };

  const row = (t: QueueTask): HTMLElement => {
    const w = t.workerId ? store.workers.get(t.workerId) : undefined;
    const meta: string[] = [];
    const buttons: HTMLElement[] = [];
    const badge = modelBadge(t.provider, t.model, t.effort);
    const model = badge ? uiText` · initial: ${badge}` : '';
    const usageSuffix = (provider: AgentProvider | undefined, usage?: Usage) => {
      const state = providerUsageState(provider, store.project, usage);
      if (state === 'untracked') return uiText(' · usage untracked');
      if (state !== 'waiting') return '';
      const waiting = providerWaitingLabel(provider, store.project);
      return waiting ? ` · ${waiting}` : '';
    };
    let pos: string | null = null;
    if (t.status === 'running') {
      const selectedProvider = providerLabel(t.provider ?? w?.provider, store.project);
      meta.push(`⚙️ ${selectedProvider}${model}${usageSuffix(t.provider ?? w?.provider, w?.usage)}`);
      meta.push(`${t.workerName ?? uiText('a worker')} · ${w ? STATUS_LABEL[w.status] ?? w.status : 'gone'}`);
      if (t.branch) meta.push(`🌿 ${t.branch}`);
      if (t.startedAt) meta.push(uiText`started ${timeAgo(t.startedAt)}`);
      meta.push(uiText`by ${t.addedBy}`);
      if (w) {
        buttons.push(h('button.btn', { type: 'button', onclick: () => actions.openTerminal(w.id) }, uiText('🖥️ Terminal')));
        if (!t.reused) buttons.push(
          h('button.btn', {
            type: 'button',
            title: uiText('Send the worker home; the task counts as stopped'),
            onclick: () => confirmDialog(uiText`Stop ${w.name}?`, uiText`This sends ${w.name} home and stops the task. You can requeue it afterwards.`, uiText('Stop'), () => net.send({ t: 'worker.kill', workerId: w.id })),
          }, uiText('⏹ Stop')),
        );
      }
    } else if (t.status === 'queued') {
      const queued = store.queue.tasks.filter((x) => x.status === 'queued');
      const i = queued.indexOf(t);
      pos = String(i + 1);
      if (t.targetWorkerId) meta.push(store.workers.get(t.targetWorkerId)?.name ?? uiText('Assigned worker unavailable'));
      meta.push(`⚙️ ${providerLabel(t.provider, store.project)}${model}${usageSuffix(t.provider, w?.usage)}`);
      meta.push(uiText`added by ${t.addedBy} ${timeAgo(t.addedAt)}`);
      buttons.push(h('button.btn', { type: 'button', title: uiText('Move up'), 'aria-label': uiText('Move up'), disabled: i === 0, onclick: () => net.send({ t: 'queue.move', taskId: t.id, delta: -1 }) }, '↑'));
      buttons.push(h('button.btn', { type: 'button', title: uiText('Move down'), 'aria-label': uiText('Move down'), disabled: i === queued.length - 1, onclick: () => net.send({ t: 'queue.move', taskId: t.id, delta: 1 }) }, '↓'));
      buttons.push(h('button.btn', { type: 'button', title: uiText('Remove from the queue'), 'aria-label': uiText('Remove'), onclick: () => net.send({ t: 'queue.remove', taskId: t.id }) }, '✕'));
    } else {
      meta.push(`⚙️ ${providerLabel(t.provider, store.project)}${model}${usageSuffix(t.provider, w?.usage)}`);
      meta.push(outcome(t));
      if (t.workerName) meta.push(t.workerName);
      if (t.branch) meta.push(`🌿 ${t.branch}`);
      if (t.finishedAt) meta.push(timeAgo(t.finishedAt));
      if (t.pr) buttons.push(h('a.btn', { href: t.pr.url, target: '_blank', rel: 'noopener', title: t.pr.title }, uiText`🔀 PR #${t.pr.number}${t.pr.state === 'MERGED' ? ' ✓' : t.pr.state === 'DRAFT' ? uiText(' (draft)') : ''}`));
      if (w) buttons.push(h('button.btn', { type: 'button', onclick: () => actions.openTerminal(w.id) }, uiText('🖥️ Terminal')));
      buttons.push(h('button.btn', { type: 'button', title: uiText('Put it back on the queue'), onclick: () => net.send({ t: 'queue.retry', taskId: t.id }) }, uiText('↻ Requeue')));
      buttons.push(h('button.btn', { type: 'button', title: uiText('Forget it'), 'aria-label': uiText('Remove'), onclick: () => net.send({ t: 'queue.remove', taskId: t.id }) }, '✕'));
    }
    return h(
      'li',
      { class: t.status },
      pos ? h('span.pos', {}, pos) : null,
      h('div.queue-main', {}, taskTitle(t), h('div.queue-meta', {}, meta.join(' · '))),
      h('div.queue-actions', {}, ...buttons),
    );
  };

  // The form stays put and only the list below it re-renders, so worker updates don't pull focus out of the textarea.
  const list = h('div');
  body.append(form, list);

  let permitted = new Set<string>();
  let rosterKey: string | undefined;
  const floor = store.floor;
  const render = () => {
    if (store.floor !== floor) return;
    const key = Array.from(store.workers.keys()).join('|');
    if (key !== rosterKey) {
      rosterKey = key;
      void fetch('/api/queue/targets?' + new URLSearchParams({floor: floor ?? ''})).then(async response => {
        if (!response.ok) throw Error();
        const ids: string[] = await response.json();
        if (rosterKey !== key || !el.isConnected) return;
        permitted = new Set(ids);
        render();
      }).catch(() => { if (rosterKey === key) rosterKey = undefined; });
    }
    const selected = target.value;
    const options = [new Option(uiText('Automatic assignment'), '')];
    for (const w of store.workers.values()) {
      if (!permitted.has(w.id)) continue;
      options.push(new Option([w.name, w.model, STATUS_LABEL[w.status]].filter(Boolean).join(' · '), w.id));
    }
    if (selected && !options.some(o => o.value === selected)) options.push(new Option(uiText('Assigned worker unavailable'), selected));
    if (options.map(o => o.text + o.value).join('|') !== Array.from(target.options, o => o.text + o.value).join('|')) {
      target.replaceChildren(...options);
      target.value = selected;
    }
    const q = store.queue;
    limitValue.textContent = q.maxWorkers === 0 ? uiText('Paused') : String(q.maxWorkers);
    minus.toggleAttribute('disabled', q.maxWorkers <= 0);
    const running = q.tasks.filter((t) => t.status === 'running');
    const queued = q.tasks.filter((t) => t.status === 'queued');
    const done = q.tasks.filter((t) => t.status === 'done').slice().reverse();
    const parts: (HTMLElement | null)[] = [
      h('p.note', {}, uiText('The queue uses available agents on this floor. Choose a name to wait for that specific agent.')),
      section(uiText('🤖 Working on it'), running),
      section(uiText('⏳ Up next'), queued),
      section(uiText('✅ Finished'), done, h('button.btn', { type: 'button', onclick: () => net.send({ t: 'queue.clear' }) }, uiText('Clear'))),
      running.length + queued.length + done.length ? null : h('div.queue-empty', {}, uiText('Nothing on the queue yet.')),
    ];
    list.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
  };

  // The machine reports every few seconds; only a change to whether the office is full shows here.
  let full = '';
  const machineChanged = () => {
    const k = `${officeFull(store.machine)}|${store.machine.limit}`;
    if (k === full) return;
    full = k;
    render();
  };
  const unsubs = [store.on('queue', render), store.on('workers', render), store.on('issues', render), store.on('machine', machineChanged)];
  const tick = setInterval(render, 30_000);
  const modal = openModal(el, {
    doing: uiText('📥 at the queue'),
    onClose: () => {
      unsubs.forEach((u) => u());
      clearInterval(tick);
    },
  });
  close.addEventListener('click', () => modal.close());
  render();
  setTimeout(() => ta.focus(), 30);
}
