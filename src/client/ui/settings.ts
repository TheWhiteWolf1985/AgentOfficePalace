import { t as uiText } from '../../shared/i18n';
import './settings.css';
import type { Net } from '../net';
import type { OfficeSound } from '../sound';
import { store, type NeedsYouSound, type Settings, type ViewMode } from '../state';
import { askNotifyPermission, notifyPermission, type DesktopNotifier } from '../notify';
import type { WebhookKind } from '../../shared/protocol';
import { h, openModal, timeAgo } from './dom';
import { agentFields, choiceLabel, officeChoice } from './provider';
import { openPromptEditor, rewrittenPrompts } from './prompts';
import { outsideSetting } from './settings-sky';
import { choiceRow } from './settings-rows';
import { languageSelect } from './language';
import { connectionsPanel } from './connections';
import { receptionSignPanel } from '../features/reception-sign/ui';
import { agentManagementPanel } from './agent-management';

const VIEWS: [ViewMode, string, string][] = [
  ['first', uiText('👀 First person'), uiText('See through your own eyes. Click the office to look around with the mouse and click things to use them. Esc frees the mouse.')],
  ['third', uiText('🎥 Third person'), uiText('Follow your character from behind. Drag to orbit the camera, scroll to zoom, and click things to use them.')],
];

const WEBHOOK_NAME: Record<WebhookKind, string> = { slack: 'Slack', discord: 'Discord', other: uiText('a webhook') };

/** The categories down the side of ⚙️ Settings. */
export type SettingsPane = 'you' | 'language' | 'sound' | 'notify' | 'building' | 'atrium-logo' | 'workers' | 'connections' | 'management';

const PANES: { id: SettingsPane; icon: string; label: string; blurb: string }[] = [
  { id: 'language', icon: '🌐', label: uiText('Language'), blurb: uiText('Choose the language of this interface.') },
  { id: 'you', icon: '🧍', label: uiText('You'), blurb: uiText('How you look, how you see the office, and how you’re signed in.') },
  { id: 'sound', icon: '🔊', label: uiText('Sound & voice'), blurb: uiText('How loud the office is for you, and how voice chat works.') },
  { id: 'notify', icon: '🔔', label: uiText('Notifications'), blurb: uiText('Hear about a worker that needs someone, or finished, while you’re somewhere else.') },
  { id: 'building', icon: '🏢', label: uiText('Building'), blurb: uiText('The sky and where new floors are cloned.') },
  { id: 'atrium-logo', icon: '🖼️', label: uiText('Atrium logo'), blurb: uiText('Centered text or your company logo, visible to everyone in the building.') },
  { id: 'workers', icon: '🤖', label: uiText('Workers'), blurb: uiText('What workers start on, how many run at once, when they go home and what the office tells them.') },
  { id: 'management', icon: '👥', label: uiText('Agent management'), blurb: uiText('Individual agents, properties and repository identities across all offices.') },
  { id: 'connections', icon: '🔗', label: uiText('GitHub and Forgejo'), blurb: uiText('Servers, accounts and remote repositories.') },
];

/** Who a setting is for, shown by its name: some are yours alone, some the whole office's. */
type Scope = 'you' | 'floor' | 'office';
const SCOPE: Record<Scope, [label: string, title: string]> = {
  you: [uiText('Just you'), uiText('Only for you, kept in this browser')],
  floor: [uiText('This floor'), uiText('The same for everyone on this floor')],
  office: [uiText('Everyone'), uiText('The same for everyone in the building')],
};

/** One setting: its name and who it's for, then whatever sets it. */
const setting = (title: string, scope: Scope | null, ...body: Node[]) =>
  h('div.setting', {}, h('div.setting-head', {}, h('h4', {}, title), scope && h('span.scope', { class: scope, title: SCOPE[scope][1] }, SCOPE[scope][0])), ...body);

/** Where ⚙️ Settings was last, so it opens there again. */
let lastPane: SettingsPane = 'you';

/** `outside` describes the sky over the office (see describeSky), once the server has said. `first` opens on that category instead of the last one. */
export function openSettings(net: Net, settings: Settings, onChange: (s: Settings) => void, onCharacter: () => void, sound: Pick<OfficeSound, 'ding' | 'needsYou'>, notifier: DesktopNotifier, onSignOut: () => void, outside?: { now: string; live: boolean }, first?: SettingsPane) {
  const seg = h('div.seg', { role: 'radiogroup', 'aria-label': uiText('Camera view') });
  const note = h('p.setting-note');
  const paint = () => {
    seg.replaceChildren(
      ...VIEWS.map(([view, label]) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(settings.view === view),
            class: settings.view === view ? 'on' : '',
            onclick: () => {
              if (settings.view === view) return;
              settings = { ...settings, view };
              onChange(settings);
              paint();
            },
          },
          label,
        ),
      ),
    );
    note.textContent = VIEWS.find(([v]) => v === settings.view)![2];
  };
  paint();

  /** A volume slider with its mute button. Dragging it turns the sound back on; letting go plays `preview`. */
  const volumeRow = (label: string, level: 'volume', muted: 'muted', preview?: () => void) => {
    const slider = h('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': label });
    const pct = h('span.vol-pct');
    const mute = h('button.btn', { type: 'button' });
    const row = h('div.volume', {}, mute, slider, pct);
    const paint = () => {
      const v = Math.round(settings[level] * 100);
      slider.value = String(v);
      slider.style.setProperty('--fill', `${v}%`);
      pct.textContent = settings[muted] ? uiText('Muted') : `${v}%`;
      mute.textContent = settings[muted] ? uiText('🔊 Unmute') : uiText('🔇 Mute');
      mute.setAttribute('aria-pressed', String(settings[muted]));
      mute.classList.toggle('danger', settings[muted]);
      row.classList.toggle('muted', settings[muted]);
    };
    paint();
    slider.addEventListener('input', () => {
      settings = { ...settings, [level]: Number(slider.value) / 100, [muted]: false };
      onChange(settings);
      paint();
    });
    if (preview) slider.addEventListener('change', preview);
    mute.addEventListener('click', () => {
      settings = { ...settings, [muted]: !settings[muted] };
      onChange(settings);
      paint();
      if (!settings[muted]) preview?.();
    });
    return row;
  };
  const soundRow = volumeRow(uiText('Office sounds volume'), 'volume', 'muted', () => sound.ding('done'));

  /** Changes some of your own settings, and has the office take them up. */
  const change = (some: Partial<Settings>) => {
    settings = { ...settings, ...some };
    onChange(settings);
  };
  // Voice chat: an open mic, or muted until you hold V.
  const talkRow = choiceRow(uiText('Voice chat'), [[false, uiText('🎙️ Open mic')], [true, uiText('✋ Push to talk')]], () => settings.pushToTalk, (pushToTalk) => change({ pushToTalk }));

  // The swish of the book's pages at the bookshelf, on or off.
  const pagesRow = choiceRow(uiText('Page turns at the bookshelf'), [[true, uiText('📖 On')], [false, uiText('Off')]], () => settings.pageTurns, (pageTurns) => change({ pageTurns }));
  // The alarm when a worker stops to ask you something; picking one plays it.
  const alarmRow = choiceRow<NeedsYouSound>(uiText('When a worker needs you'), [['once', uiText('🔔 Ring once')], ['remind', uiText('🔁 Keep reminding me')], ['off', uiText('🔕 Off')]], () => settings.needsYouSound, (needsYouSound) => {
    change({ needsYouSound });
    if (needsYouSound !== 'off') sound.needsYou();
  });

  // Desktop notifications: this browser's permission, then your own on/off.
  const notifyRow = h('div.seg');
  const notifyNote = h('p.setting-note');
  const paintNotify = () => {
    const perm = notifyPermission();
    const on = perm === 'granted' && settings.notify;
    notifyRow.replaceChildren();
    if (perm === 'default') {
      notifyRow.append(
        h(
          'button.btn.primary',
          {
            type: 'button',
            onclick: async () => {
              if ((await askNotifyPermission()) === 'granted') {
                settings = { ...settings, notify: true };
                onChange(settings);
                notifier.sample();
              }
              paintNotify();
            },
          },
          uiText('🔔 Turn on notifications'),
        ),
      );
    } else if (perm === 'granted') {
      for (const [value, label] of [
        [true, uiText('🔔 On')],
        [false, uiText('🔕 Off')],
      ] as const) {
        notifyRow.append(
          h(
            'button.btn',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(on === value),
              class: on === value ? 'on' : '',
              onclick: () => {
                settings = { ...settings, notify: value };
                onChange(settings);
                paintNotify();
              },
            },
            label,
          ),
        );
      }
      if (on) notifyRow.append(h('button.btn', { type: 'button', onclick: () => notifier.sample() }, uiText('Show me one')));
    }
    notifyNote.textContent =
      perm === 'unsupported'
        ? uiText('This browser can’t show notifications from the office here. They need https or localhost (an SSH tunnel counts).')
        : perm === 'denied'
          ? uiText('Your browser blocks notifications from the office. Allow them in the site settings (the icon left of the address), then open this again.')
          : uiText('When a worker needs you or finishes while you’re in another tab or app, you get a notification. Click it to go straight to that worker: you’re put at its desk with its terminal open. The tab title counts the workers waiting on someone either way.');
  };
  paintNotify();

  // The office's Slack / Discord webhook, shared by everyone.
  const hookStatus = h('p.setting-note');
  const hookInput = h('input', { type: 'text', placeholder: 'https://hooks.slack.com/services/…', 'aria-label': uiText('Slack or Discord webhook URL'), spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const hookSave = h('button.btn.primary', { type: 'button' }, uiText('Save'));
  const hookTest = h('button.btn', { type: 'button' }, uiText('Send a test'));
  const hookRemove = h('button.btn.danger', { type: 'button' }, uiText('Remove'));
  const hookActions = h('div.seg', { style: 'margin-top:8px' }, hookTest, hookRemove);
  const paintHook = () => {
    const { webhook, error, lastSentAt } = store.notify;
    hookActions.classList.toggle('hidden', !webhook);
    hookSave.textContent = webhook ? uiText('Replace') : uiText('Save');
    hookStatus.classList.toggle('bad', !!error);
    hookStatus.textContent = !webhook
      ? uiText('Paste an incoming webhook from Slack or Discord, and the office posts to that channel when a worker needs input or finishes and nobody has its terminal open. It’s for everyone in the office.')
      : error
        ? uiText`⚠️ Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}) failed: ${error}`
        : uiText`📣 Posting to ${WEBHOOK_NAME[webhook.kind]} (${webhook.hint}), set by ${webhook.by} ${timeAgo(webhook.at)}${lastSentAt ? uiText` · last message ${timeAgo(lastSentAt)}` : ''}.`;
  };
  paintHook();
  const saveHook = () => {
    const url = hookInput.value.trim();
    if (!url) return hookInput.focus();
    net.send({ t: 'notify.webhook', url });
    hookInput.value = '';
  };
  hookSave.addEventListener('click', saveHook);
  hookInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveHook();
  });
  hookTest.addEventListener('click', () => net.send({ t: 'notify.test' }));
  hookRemove.addEventListener('click', () => net.send({ t: 'notify.webhook', url: '' }));

  // The worker everyone starts on, unless whoever starts one picks another. Admins pick it.
  const agent = agentFields(store.project, 'office-agent', officeChoice(store.project));
  let agentTouched = false;
  agent.element.addEventListener('change', () => (agentTouched = true));
  agent.element.addEventListener('input', () => (agentTouched = true));
  const agentSave = h('button.btn.primary', { type: 'button' }, uiText('Save'));
  const agentBack = h('button.btn', { type: 'button' });
  const agentActions = h('div.seg', { style: 'margin-top:8px' }, agentSave, agentBack);
  const agentNow = h('p.outside-now');
  const agentNote = h('p.setting-note');
  const paintAgent = () => {
    const admin = store.me.admin;
    const picked = store.prompts.agent;
    const now = officeChoice(store.project);
    agent.element.classList.toggle('hidden', !admin);
    agentActions.classList.toggle('hidden', !admin);
    agentNow.classList.toggle('hidden', admin);
    agentNow.textContent = choiceLabel(now);
    agentBack.classList.toggle('hidden', !picked);
    agentBack.textContent = uiText`Back to ${store.project?.agentCmd.split(' ')[0].split(/[\\/]/).pop() ?? uiText('the --agent')}`;
    if (!agentTouched) agent.set(now);
    agentNote.textContent =
      uiText('Every worker starts on this: hired at a desk, handed an issue or a pull request from the boards, taken off the queue, the board agents and meetings. Where you start one, ✏️ Edit picks another just for it.') +
      (picked ? uiText` Set by ${picked.by} ${timeAgo(picked.at)}.` : uiText(' It’s the agent the office was started with, on its own default model.')) +
      (admin ? '' : uiText(' Admins can change it.'));
  };
  paintAgent();
  agentSave.addEventListener('click', () => {
    if (!agent.valid()) return;
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: agent.choice() });
  });
  agentBack.addEventListener('click', () => {
    agentTouched = false;
    net.send({ t: 'prompts.agent', choice: null });
  });

  // The prompts the office writes for workers by itself, for the whole office. Admins rewrite them.
  const promptsOpen = h('button.btn', { type: 'button', onclick: () => openPromptEditor(net) });
  const promptsNote = h('p.setting-note');
  const paintPrompts = () => {
    const n = rewrittenPrompts();
    promptsOpen.textContent = store.me.admin ? uiText('📝 Edit the prompts…') : uiText('📝 Read the prompts…');
    promptsNote.textContent =
      uiText('What 🤖 Hand to a worker, 🔍 Review and the boards’ other buttons tell a worker, the note the queue adds to a task, the board agents’ briefs, the meeting room’s parts and the sign writer’s instructions. ') +
      (n ? uiText`${n} of them rewritten.` : uiText('All as the office wrote them.')) +
      (store.me.admin ? '' : uiText(' Admins can rewrite them.'));
  };
  paintPrompts();

  // The most workers the office runs at once, across every floor. Admins set it.
  const limitInput = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': uiText('Most workers at once'), spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const limitSave = h('button.btn.primary', { type: 'button' }, uiText('Set limit'));
  const limitClear = h('button.btn', { type: 'button' });
  const limitRow = h('div.webhook', {}, limitInput, limitSave, limitClear);
  const limitNote = h('p.setting-note');
  const paintLimit = () => {
    const m = store.machine;
    const admin = store.me.admin;
    limitRow.classList.toggle('hidden', !admin);
    limitInput.placeholder = m.ceiling ? uiText`1 to ${m.ceiling}` : 'e.g. 6';
    limitClear.textContent = m.ceiling ? uiText`Back to ${m.ceiling}` : uiText('No limit');
    limitClear.classList.toggle('hidden', !m.set);
    const now =
      m.limit === undefined
        ? uiText`No limit: the office hires a worker for every free seat. ${m.workers} ${m.workers === 1 ? 'is' : 'are'} here now, across every floor.`
        : uiText`At most ${m.limit} worker${m.limit === 1 ? '' : 's'} at once, across every floor (${m.workers} now), shells and board agents too. Hiring past that is refused.`;
    const from = m.set ? uiText` Set by ${m.set.by} ${timeAgo(m.set.at)}.` : '';
    const cap = m.ceiling ? uiText` The office was started with --max-workers ${m.ceiling}, so it can't go any higher.` : '';
    limitNote.textContent = now + from + cap + (admin ? '' : uiText(' Admins can change it.'));
  };
  paintLimit();
  const saveLimit = () => {
    const n = Number(limitInput.value.trim());
    if (!limitInput.value.trim() || !Number.isInteger(n) || n < 1) return limitInput.focus();
    net.send({ t: 'machine.limit', limit: n });
    limitInput.value = '';
  };
  limitSave.addEventListener('click', saveLimit);
  limitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveLimit();
  });
  limitClear.addEventListener('click', () => net.send({ t: 'machine.limit', limit: null }));

  // Whether a worker whose pull request merged goes home by itself, for everyone.
  const leaveRow = h('div.seg', { role: 'radiogroup', 'aria-label': uiText('Workers whose pull request merged') });
  const leaveNote = h('p.setting-note');
  const paintLeave = () => {
    const { on, by, at } = store.leaveOnMerge;
    leaveRow.replaceChildren(
      ...([
        [true, uiText('🏠 Go home by themselves')],
        [false, uiText('🪑 Stay until sent home')],
      ] as const).map(([value, label]) =>
        h(
          'button.btn',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(on === value),
            class: on === value ? 'on' : '',
            onclick: () => {
              if (store.leaveOnMerge.on !== value) net.send({ t: 'leaveOnMerge.set', on: value });
            },
          },
          label,
        ),
      ),
    );
    const now = on
      ? uiText('Once a worker’s pull request merges, it goes home as soon as it isn’t working or waiting on you and nobody has its terminal open, and its worktree and branch are deleted. A worktree with uncommitted changes, or commits that aren’t on GitHub, is kept.')
      : uiText('A worker whose pull request merged stays at its desk, outlined in purple, until someone sends it home. Turned on, the ones already merged go too.');
    leaveNote.textContent = uiText`${now} It’s the same for everyone in the building${by ? uiText`, set by ${by}${at ? ` ${timeAgo(at)}` : ''}` : ''}.`;
  };
  paintLeave();

  // Where the elevator clones new projects on the office's machine. Admins move it.
  const dirInput = h('input', { type: 'text', placeholder: '~/Workspace', 'aria-label': uiText('Workspace folder'), spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
  const dirSave = h('button.btn.primary', { type: 'button' }, uiText('Save'));
  const dirDefault = h('button.btn', { type: 'button' }, uiText('Use the default'));
  const dirRow = h('div.webhook', {}, dirInput, dirSave);
  const dirActions = h('div.seg', { style: 'margin-top:8px' }, dirDefault);
  const dirNote = h('p.setting-note');
  const paintDir = () => {
    const { dir, custom, by, at } = store.projectsDir;
    const admin = store.me.admin;
    dirInput.value = dir;
    dirRow.classList.toggle('hidden', !admin);
    dirActions.classList.toggle('hidden', !admin || !custom);
    dirNote.textContent =
      uiText`New projects from the elevator are cloned into ${dir}/<owner>/<repo> on the office’s machine.` +
      (custom && by && at ? uiText` Set by ${by} ${timeAgo(at)}.` : '') +
      (admin ? uiText(' A checkout of the same repository that’s already there is used as it is. Floors you already have stay where they are.') : uiText(' An admin can move it.'));
  };
  paintDir();
  const saveDir = () => {
    const dir = dirInput.value.trim();
    if (!dir) return dirInput.focus();
    if (dir !== store.projectsDir.dir) net.send({ t: 'floor.projectsDir', dir });
  };
  dirSave.addEventListener('click', saveDir);
  dirInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveDir();
  });
  dirDefault.addEventListener('click', () => net.send({ t: 'floor.projectsDir', dir: '' }));

  // What the sky's doing, and which clock it keeps (see settings-sky.ts).
  const sky = outside && outsideSetting(net, outside, (body) => setting(uiText('Outside'), 'office', ...body));
  const account = store.me.account;
  const signOut = h('button.btn', { type: 'button' }, uiText('🚪 Sign out'));
  signOut.addEventListener('click', onSignOut);
  const character = h('button.btn', { type: 'button' }, uiText('🧍 Your character'));
  const connections = store.me.admin ? connectionsPanel() : undefined;
  const management = store.me.admin ? agentManagementPanel() : undefined;
  const receptionSign = receptionSignPanel();
  const panes: Record<SettingsPane, Node[]> = {
    connections: [connections?.element ?? h('p', {}, uiText('Administrator access required'))],
    management: [management?.element ?? h('p', {}, uiText('Administrator access required'))],
    'atrium-logo': [receptionSign.element],
    language: [setting(uiText('Language'), 'you',
      languageSelect(),
      h('p.setting-note', {}, uiText('Changing language reloads this page. Your agents keep working.')))],
    you: [
      setting(uiText('Your character'), null, character, h('p.setting-note', {}, account ? uiText('Your appearance and preferences follow your personal account.') : uiText('Shared access keeps appearance and preferences in this browser.'))),
      setting(uiText('Camera view'), 'you', seg, note),
      setting(uiText('Signed in'), null, h('div.volume', {}, signOut), h('p.setting-note', {}, account ? uiText`As ${account.name}, with your own account (${account.role}).` : uiText('With the shared office password.'))),
    ],
    sound: [
      setting(uiText('Office sounds'), 'you', soundRow, h('p.setting-note', {}, uiText('Workers typing, footsteps, birds and rain outside, the ding when a worker is done and the alarm when one needs you. Voice chat isn’t affected.'))),
      setting(uiText('When a worker needs you'), 'you', alarmRow, h('p.setting-note', {}, uiText('An alarm the moment a worker stops to ask you something or wants a permission. Keep reminding me rings it again, softly, every 30 seconds until someone opens that worker’s terminal. It’s as loud as the office sounds are.'))),
      setting(uiText('Page turns at the bookshelf'), 'you', pagesRow, h('p.setting-note', {}, uiText('A soft swish each time the book in your hands turns a page, as you open a doc or scroll through one. The 🔈 at the top of the bookshelf turns it off too.'))),
      setting(uiText('Voice chat'), 'you', talkRow, h('p.setting-note', {}, uiText('Either way, V joins voice, holding V talks and you’re muted once you let go, and M mutes or unmutes. With push to talk you join muted. Leave voice from the ☰ menu.'))),
    ],
    notify: [
      setting(uiText('Desktop notifications'), 'you', notifyRow, notifyNote),
      setting(uiText('Team notifications (Slack / Discord)'), 'office', h('div.webhook', {}, hookInput, hookSave), hookActions, hookStatus),
    ],
    building: [
      ...(sky ? [sky.section] : []),
      setting(uiText('Workspace folder'), 'office', dirRow, dirActions, dirNote),
    ],
    workers: [
      setting(uiText('Default worker'), 'office', agentNow, agent.element, agentActions, agentNote),
      setting(uiText('Worker limit'), 'office', limitRow, limitNote),
      setting(uiText('Workers whose pull request merged'), 'office', leaveRow, leaveNote),
      setting(uiText('Prompts'), 'office', promptsOpen, promptsNote),
    ],
  };

  // The categories down the side, the one picked on the right.
  const nav = h('nav.settings-nav', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': uiText('Settings') });
  const tabs = new Map<SettingsPane, HTMLButtonElement>();
  const bodies = new Map<SettingsPane, HTMLElement>();
  for (const p of PANES) {
    const tab = h('button.settings-tab', { type: 'button', role: 'tab', onclick: () => show(p.id) }, h('span.icon', { 'aria-hidden': 'true' }, p.icon), h('span', {}, p.label)) as HTMLButtonElement;
    tabs.set(p.id, tab);
    nav.append(tab);
    bodies.set(p.id, h('section.settings-pane', { role: 'tabpanel', 'aria-label': p.label }, h('div.settings-head', {}, h('h3', {}, `${p.icon} ${p.label}`), h('p', {}, p.blurb)), ...panes[p.id]));
  }
  const show = (id: SettingsPane) => {
    lastPane = id;
    if (id === 'atrium-logo') receptionSign.load();
    el.classList.toggle('settings-wide', id === 'connections' || id === 'management');
    for (const [t, tab] of tabs) {
      tab.classList.toggle('on', t === id);
      tab.setAttribute('aria-selected', String(t === id));
      tab.tabIndex = t === id ? 0 : -1;
    }
    for (const [t, body] of bodies) body.classList.toggle('hidden', t !== id);
    bodies.get(id)!.scrollTop = 0;
    // On a phone the categories are a row across the top that scrolls sideways.
    tabs.get(id)!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  nav.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = PANES.findIndex((p) => p.id === lastPane);
    const next = PANES[(i + step + PANES.length) % PANES.length].id;
    show(next);
    tabs.get(next)!.focus();
  });

  const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
  const el = h('div.modal.settings', { role: 'dialog', 'aria-label': uiText('Settings') }, h('header', {}, h('h2', {}, uiText('⚙️ Settings')), close), h('div.settings-body', {}, nav, ...bodies.values()));
  const offNotify = store.on('notify', paintHook);
  const offLeave = store.on('leaveOnMerge', paintLeave);
  const offLimit = [store.on('machine', paintLimit), store.on('me', paintLimit)];
  const offDir = [store.on('projectsDir', paintDir), store.on('me', paintDir)];
  const offPrompts = [store.on('prompts', paintAgent), store.on('prompts', paintPrompts), store.on('me', paintAgent), store.on('me', paintPrompts)];
  const modal = openModal(el, {
    doing: uiText('⚙️ in settings'),
    onClose: () => {
      connections?.dispose(); management?.dispose();
      receptionSign.dispose();
      offNotify();
      sky?.off();
      offLeave();
      offLimit.forEach((off) => off());
      offDir.forEach((off) => off());
      offPrompts.forEach((off) => off());
    },
  });
  show(first ?? lastPane);
  close.addEventListener('click', () => modal.close());
  character.addEventListener('click', () => {
    modal.close();
    onCharacter();
  });
}
