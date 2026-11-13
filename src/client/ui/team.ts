import { t as uiText } from '../../shared/i18n';
import './team.css';
import type { ServerMsg, TeamState } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal } from './dom';
import { confirmDialog } from './prompt';

export type Os = 'mac' | 'linux' | 'windows';
export const OS_LABEL: Record<Os, string> = { mac: 'macOS', linux: 'Linux', windows: 'Windows' };

export function guessOs(): Os {
  const p = navigator.userAgent;
  return /Windows/i.test(p) ? 'windows' : /Mac/i.test(p) ? 'mac' : 'linux';
}

/** Opens a URL in the browser, for ssh's LocalCommand. */
export function openCommand(url: string, os: Os): string {
  return os === 'mac' ? `open ${url}` : os === 'windows' ? `start ${url}` : `xdg-open ${url} >/dev/null 2>&1 &`;
}

/** One command that opens the tunnel and, once it's up, the office in their browser. */
export function tunnelCommand(t: TeamState, os: Os): string {
  // LocalCommand runs after the forward is listening, so the page loads on the first try.
  const open = openCommand(`http://localhost:${t.port}`, os);
  return `ssh -o ExitOnForwardFailure=yes -o PermitLocalCommand=yes -o LocalCommand="${open}" -L ${t.port}:localhost:${t.port} ${t.ssh}`;
}

function inviteMessage(t: TeamState, os: Os): string {
  const project = store.project?.name ?? 'our';
  return [
    uiText`You're invited to the ${project} Agent Office. Run this in a terminal (${OS_LABEL[os]}):`,
    '',
    tunnelCommand(t, os),
    '',
    uiText`It opens the office at http://localhost:${t.port} — sign in (with the office password, or the account link you get from me) and keep that terminal open while you're in.`,
    t.fingerprint ? uiText`The first time, ssh asks whether to trust the server. Only say yes if it shows ${t.fingerprint}` : '',
  ]
    .filter((l, i, all) => l || all[i - 1])
    .join('\n')
    .trim();
}

/** On an office on a Tailscale network: the link, and how to get onto the network. */
function tailnetMessage(t: TeamState): string {
  const project = store.project?.name ?? 'our';
  return [
    uiText`You're invited to the ${project} Agent Office: https://${t.tailnet}`,
    '',
    uiText("It's on our Tailscale network. If you aren't on it yet: install Tailscale (https://tailscale.com/download), sign in, and accept the invite I send you from Tailscale. Then open the link and sign in with the office password, or the account link you get from me."),
  ].join('\n');
}

const TAILSCALE_ADMIN = 'https://login.tailscale.com/admin';

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not a secure context: fall back to a hidden textarea.
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function copyButton(label: string, text: () => string, cls = '') {
  const btn = h('button.btn', { type: 'button', class: cls }, label);
  btn.addEventListener('click', async () => {
    btn.textContent = (await copy(text())) ? uiText('✓ Copied') : uiText('Copy failed');
    setTimeout(() => (btn.textContent = label), 1600);
  });
  return btn;
}

let onInvited: ((msg: Extract<ServerMsg, { t: 'team.invited' }>) => void) | null = null;

export function routeTeamMessage(msg: ServerMsg) {
  if (msg.t === 'team.invited') onInvited?.(msg);
}

export function openTeam(net: Net) {
  let os = guessOs();
  let status: HTMLElement | null = null;
  const body = h('div.body.team');
  const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
  const message = (t: TeamState) => (t.tailnet ? tailnetMessage(t) : inviteMessage(t, os));
  const copyMsg = copyButton(uiText('✉️ Copy invite message'), () => (store.team ? message(store.team) : ''), 'primary');
  const footer = h('footer', {}, h('span.grow', {}, uiText('Invited people still need to sign in: the office password, or an account from 🔑 Accounts.')), copyMsg);
  const el = h('div.modal', { role: 'dialog', 'aria-label': uiText('Invite teammates'), style: 'width:min(680px,100%)' }, h('header', {}, h('h2', {}, uiText('👥 Invite teammates')), close), body, footer);

  const input = h('input', { type: 'text', maxlength: 40, placeholder: uiText('GitHub username'), 'aria-label': uiText('GitHub username'), autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const inviteBtn = h('button.btn.primary', { type: 'submit' }, uiText('Invite'));
  const form = h('form.invite-row', {}, input, inviteBtn) as HTMLFormElement;
  const setStatus = (text: string, kind: 'busy' | 'ok' | 'error') => {
    status = h('p.team-status', { class: kind }, text);
    render();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const github = input.value.trim();
    if (!github) return input.focus();
    inviteBtn.disabled = true;
    setStatus(uiText`Fetching ${github}'s keys from GitHub…`, 'busy');
    net.send({ t: 'team.invite', github });
  });

  let focused = false;
  const render = () => {
    const t = store.team;
    const typing = document.activeElement === input;
    body.replaceChildren();
    if (!t) return body.append(h('p.empty', {}, uiText('Loading…')));
    footer.classList.toggle('hidden', !!t.unavailable);
    if (t.unavailable) return body.append(h('p', { style: 'margin:0;font-weight:700' }, t.unavailable));
    if (t.tailnet) return renderTailnet(t);

    body.append(
      h('label', {}, uiText('Invite someone by their GitHub username')),
      form,
      h('p.note', {}, uiText('Their SSH keys from github.com/<username>.keys can open a tunnel to this office — nothing else: no shell on the machine, no other ports.')),
    );
    if (status) body.append(status);
    if (t.error) body.append(h('p.team-status.error', {}, t.error));

    const tabs = h(
      'div.os-tabs',
      {},
      ...(Object.keys(OS_LABEL) as Os[]).map((o) =>
        h('button.btn', { type: 'button', class: o === os ? 'on' : '', onclick: () => ((os = o), render()) }, OS_LABEL[o]),
      ),
    );
    body.append(
      h('div.team-head', {}, h('h4', {}, uiText('Then send them this')), tabs),
      h('div.cmd', {}, h('pre', {}, tunnelCommand(t, os)), copyButton(uiText('Copy'), () => tunnelCommand(t, os))),
      h(
        'p.note',
        {},
        uiText`It opens the tunnel and http://localhost:${t.port} in their browser. They keep the terminal open while they're in. `,
        t.fingerprint ? h('span', {}, uiText('The first time, ssh asks whether to trust the server: the fingerprint must be '), h('code', {}, t.fingerprint), '.') : null,
      ),
    );
    // Railway's TCP proxy, a Fly.io app's IP address and the port Dokploy or Coolify publishes
    // (addresses with a port of their own) answer every IP; AWS's firewall doesn't.
    if (!t.ssh?.startsWith('ssh://')) {
      body.append(h('p.note', {}, uiText('SSH only answers IP addresses you allowed. If theirs isn\'t, run '), h('code', {}, `${t.deploy ?? 'deploy/aws.sh'} allow <their-ip>`), uiText(' (or '), h('code', {}, uiText('allow anywhere')), uiText(') on your machine.')));
    }

    body.append(h('h4', {}, uiText(`Invited `), h('span.count', {}, String(t.members.length))), memberList(t));
    if (typing || !focused) setTimeout(() => input.focus(), 30);
    focused = true;
  };

  // Tailscale decides who gets in: the panel says how to let someone onto the network.
  const renderTailnet = (t: TeamState) => {
    const url = `https://${t.tailnet}`;
    const link = (path: string, text: string) => h('a', { href: `${TAILSCALE_ADMIN}/${path}`, target: '_blank', rel: 'noopener' }, text);
    body.append(
      h('label', {}, uiText('Everyone on your Tailscale network opens')),
      h('div.cmd', {}, h('pre', {}, url), copyButton(uiText('Copy'), () => url)),
      h('p.note', {}, uiText('Nothing to run and no terminal to keep open. It comes over HTTPS, so voice and screen sharing work.')),
      h('h4', {}, uiText("Someone who isn't on it")),
      h(
        'p.note',
        {},
        uiText('Share this one machine with them: on Tailscale\'s '),
        link('machines', uiText('Machines')),
        uiText(' page, open '),
        h('code', {}, t.tailnet!.split('.')[0]),
        uiText(', choose Share… and send them the link. Once they accept, they reach this machine and nothing else of yours. Or add them to your network under '),
        link('users', uiText('Users')),
        '.',
      ),
    );
    if (status) body.append(status);
    if (t.error) body.append(h('p.team-status.error', {}, t.error));
    // People invited before the office went on the tailnet can still tunnel in, until they're removed.
    if (t.members.length) body.append(h('h4', {}, uiText('Invited by SSH key '), h('span.count', {}, String(t.members.length))), memberList(t));
  };

  const memberList = (t: TeamState) => {
    const list = h('ul.team-list');
    for (const m of t.members) {
      const remove = h('button.btn', { type: 'button', title: uiText`Remove ${m.name}'s access` }, uiText('Remove'));
      remove.addEventListener('click', () =>
        confirmDialog(
          uiText`Remove ${m.name}?`,
          uiText`Their keys stop working right away. Every open tunnel drops for a moment too (other teammates just re-run their command). ${m.name} still knows the office password.`,
          uiText('Remove'),
          () => net.send({ t: 'team.remove', name: m.name }),
        ),
      );
      list.append(h('li', {}, h('span.name', {}, m.name), h('span.keys', {}, uiText`${m.keys} key${m.keys === 1 ? '' : 's'}`), remove));
    }
    if (!t.members.length) list.append(h('li.empty', {}, uiText('Nobody yet')));
    return list;
  };

  onInvited = (msg) => {
    inviteBtn.disabled = false;
    if (msg.error) return setStatus(msg.error, 'error');
    input.value = '';
    setStatus(uiText`✅ ${msg.name} is invited (${msg.keys} key${msg.keys === 1 ? '' : 's'}). Send them the command below.`, 'ok');
  };
  const unsub = store.on('team', render);
  const modal = openModal(el, {
    onClose: () => {
      unsub();
      onInvited = null;
    },
  });
  close.addEventListener('click', () => modal.close());
  render();
  net.send({ t: 'team.get' });
}
