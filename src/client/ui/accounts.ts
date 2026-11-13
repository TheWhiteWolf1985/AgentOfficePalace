import { t as uiText } from '../../shared/i18n';
import './accounts.css';
import type { AccountInvite, AccountRole, ServerMsg } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, timeAgo } from './dom';
import { confirmDialog } from './prompt';
import { copyButton } from './team';

export const inviteLink = (v: AccountInvite) => `${location.origin}/join#${v.token}`;

function expiresIn(t: number): string {
  const d = Math.round((t - Date.now()) / 86_400_000);
  return d >= 1 ? uiText`expires in ${d} day${d === 1 ? '' : 's'}` : uiText('expires today');
}

let onInvited: ((msg: Extract<ServerMsg, { t: 'accounts.invited' }>) => void) | null = null;

export function routeAccountsMessage(msg: ServerMsg) {
  if (msg.t === 'accounts.invited') onInvited?.(msg);
}

/** 🔑 Accounts, for admins: invite people by link, list them, change their role or revoke them. */
export function openAccounts(net: Net) {
  let status: HTMLElement | null = null;
  /** The invite just made, shown big until the next one. */
  let fresh: AccountInvite | null = null;
  const body = h('div.body.team.accounts');
  const close = h('button.btn.close', { 'aria-label': uiText('Close') }, '✕');
  const signedInAs = h('span.grow');
  const el = h(
    'div.modal',
    { role: 'dialog', 'aria-label': uiText('Accounts'), style: 'width:min(680px,100%)' },
    h('header', {}, h('h2', {}, uiText('🔑 Accounts')), close),
    body,
    h('footer', {}, signedInAs),
  );

  const nameInput = h('input', { type: 'text', maxlength: 24, placeholder: uiText('Their name (optional)'), 'aria-label': uiText('Their name'), autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const roleSelect = h('select', { 'aria-label': uiText('Role') }, h('option', { value: 'member' }, uiText('Member')), h('option', { value: 'admin' }, uiText('Admin'))) as HTMLSelectElement;
  const inviteBtn = h('button.btn.primary', { type: 'submit' }, uiText('Make invite link'));
  const form = h('form.invite-row', {}, nameInput, roleSelect, inviteBtn) as HTMLFormElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    inviteBtn.disabled = true;
    net.send({ t: 'accounts.invite', name: nameInput.value.trim() || undefined, role: roleSelect.value as AccountRole });
  });

  const render = () => {
    const s = store.accounts;
    const me = store.me;
    signedInAs.textContent = me.account ? uiText`You're signed in as ${me.account.name} (${me.account.role}).` : uiText("You're signed in with the shared office password.");
    const typing = document.activeElement === nameInput;
    body.replaceChildren();
    if (!s) return body.append(h('p.empty', {}, uiText('Loading…')));

    body.append(
      h('label', {}, uiText('Invite someone')),
      form,
      h('p.note', {}, uiText('You get a link that makes one account, with its own name and password. It works once and expires after 7 days. Leave the name empty and they pick their own.')),
    );
    if (status) body.append(status);
    if (fresh) {
      const v = fresh;
      body.append(h('div.cmd', {}, h('pre', {}, inviteLink(v)), copyButton(uiText('Copy'), () => inviteLink(v))));
    }
    if (store.invites) body.append(h('p.note', {}, uiText('On this office they also need a way in first: see 👥 Invite teammates.')));

    const list = h('ul.team-list');
    for (const a of s.accounts) {
      const you = me.account?.name === a.name;
      const seen = a.online ? uiText('in the office') : a.lastSeenAt ? uiText`seen ${timeAgo(a.lastSeenAt)}` : uiText('never came in');
      const role = h('button.btn', { type: 'button', title: a.role === 'admin' ? uiText('Take away admin rights') : uiText('Let them manage accounts too') }, a.role === 'admin' ? uiText('Make member') : uiText('Make admin'));
      role.addEventListener('click', () => net.send({ t: 'accounts.role', accountId: a.id, role: a.role === 'admin' ? 'member' : 'admin' }));
      const revoke = h('button.btn.danger', { type: 'button', title: uiText`Delete ${a.name}'s account` }, uiText('Revoke'));
      revoke.addEventListener('click', () =>
        confirmDialog(
          uiText`Revoke ${a.name}?`,
          uiText`Their account is deleted and they're signed out everywhere right away. Terminals they typed in keep running. ${s.sharedPassword ? uiText`If ${a.name} also knows the shared office password, they can still use that: switch it off below.` : ''}`,
          uiText('Revoke'),
          () => net.send({ t: 'accounts.revoke', accountId: a.id }),
        ),
      );
      list.append(
        h(
          'li',
          {},
          h('span.dot', { class: a.online ? 'on' : '', title: seen }),
          h('span.name', {}, a.name, you ? h('span.you', {}, uiText(' (you)')) : null),
          h('span.role', { class: a.role }, a.role),
          h('span.keys', { title: uiText`Invited by ${a.createdBy}` }, seen),
          you ? null : role,
          you ? null : revoke,
        ),
      );
    }
    if (!s.accounts.length) list.append(h('li.empty', {}, uiText('Nobody has an account yet')));
    body.append(h('h4', {}, uiText('People '), h('span.count', {}, String(s.accounts.length))), list);

    if (s.invites.length) {
      const invites = h('ul.team-list');
      for (const v of s.invites) {
        const cancel = h('button.btn', { type: 'button', title: uiText('The link stops working') }, uiText('Cancel'));
        cancel.addEventListener('click', () => {
          if (fresh?.id === v.id) fresh = null;
          net.send({ t: 'accounts.cancel', inviteId: v.id });
        });
        invites.append(
          h(
            'li',
            {},
            h('span.name', {}, v.name ?? h('i', {}, uiText('they pick a name'))),
            h('span.role', { class: v.role }, v.role),
            h('span.keys', { title: uiText`Made by ${v.createdBy} ${timeAgo(v.createdAt)}` }, expiresIn(v.expiresAt)),
            copyButton(uiText('Copy link'), () => inviteLink(v)),
            cancel,
          ),
        );
      }
      body.append(h('h4', {}, uiText('Open invites '), h('span.count', {}, String(s.invites.length))), invites);
    }

    // The shared password: the old way in, kept as a fallback until everyone has an account.
    const toggle = h('button.btn', { type: 'button', class: s.sharedPassword ? 'danger' : '' }, s.sharedPassword ? uiText('Switch it off') : uiText('Switch it back on'));
    const canSwitchOff = me.account?.role === 'admin';
    if (s.sharedPassword && !canSwitchOff) toggle.setAttribute('disabled', '');
    toggle.addEventListener('click', () => {
      if (!s.sharedPassword) return net.send({ t: 'accounts.shared', on: true });
      confirmDialog(
        uiText('Switch off the shared password?'),
        uiText('From now on only people with an account of their own can sign in. Everyone who came in with the shared password is signed out right away.'),
        uiText('Switch it off'),
        () => net.send({ t: 'accounts.shared', on: false }),
      );
    });
    body.append(
      h('div.team-head', {}, h('h4', {}, uiText('Shared office password')), toggle),
      h(
        'p.note',
        {},
        s.sharedPassword
          ? uiText('On. Anyone who knows it gets in as an admin and picks any name they like. Once everyone has an account, switch it off, so that revoking someone really locks them out.')
          : uiText('Off: only accounts can sign in. If every admin is ever locked out, run agent-office accounts password on on the office’s machine.'),
        s.sharedPassword && !canSwitchOff ? h('b', {}, uiText(' Make yourself an admin account and sign in with it before you switch it off.')) : null,
      ),
    );
    if (typing) nameInput.focus();
  };

  onInvited = (msg) => {
    inviteBtn.disabled = false;
    if (msg.error || !msg.invite) {
      status = h('p.team-status.error', {}, msg.error ?? uiText('Could not make the invite'));
      return render();
    }
    fresh = msg.invite;
    nameInput.value = '';
    status = h('p.team-status.ok', {}, uiText`✅ Send this link to ${msg.invite.name ?? 'them'}. It works once and expires after 7 days.`);
    render();
  };
  // No longer an admin (someone changed your role): the list isn't yours to see any more.
  const unsubs = [store.on('accounts', render), store.on('me', () => (store.me.admin ? render() : modal.close()))];
  const modal = openModal(el, {
    onClose: () => {
      unsubs.forEach((u) => u());
      onInvited = null;
    },
  });
  close.addEventListener('click', () => modal.close());
  render();
  setTimeout(() => nameInput.focus(), 30);
  net.send({ t: 'accounts.get' });
}
