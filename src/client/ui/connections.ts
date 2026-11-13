import './connections.css';
import { t, remoteText } from '../../shared/i18n';
import type { ConnectionsView, GitAccount, GitServer, GitRepository } from '../../shared/connections';
import { h } from './dom';
import { confirmDialog } from './prompt';
import { connectionRequest as request, loadConnections, connectionField as field, connectionSelect as select, connectionButton as button } from './connections-client';

/** Admin settings for service connections; account secrets are only ever submitted, never fetched. */
export function connectionsPanel(): { element: HTMLElement; dispose(): void } {
  const status = h('p.connection-status', { role: 'status' });
  const body = h('div.connection-content');
  let data: ConnectionsView;
  let pane: 'servers' | 'accounts' | 'repositories' = 'servers';
  let selectedServer = '', selectedAccount = '';
  let disposed = false, busy = false, login: string | undefined, loginTimer: ReturnType<typeof setTimeout> | undefined;
  const run = async (work: () => Promise<void>) => {
    if (busy || disposed) return;
    busy = true; element.setAttribute('aria-busy', 'true'); status.className = 'connection-status'; status.textContent = t('Working…');
    try { await work(); if (!disposed && status.textContent === t('Working…')) status.textContent = t('Operation completed'); }
    catch (error) { if (!disposed) { status.className = 'connection-status bad'; status.textContent = remoteText((error as Error).message); } }
    finally { busy = false; element.removeAttribute('aria-busy'); }
  };
  const reload = async () => { data = await loadConnections(); if (!disposed) render(); };
  const nav = h('div.connection-tabs', { role: 'tablist', 'aria-label': t('GitHub and Forgejo') });
  const element = h('section.connections', {}, h('p.setting-note', {}, t('Connect servers and accounts, then select a repository for each office. Agent identities are managed in Agent management.')),
    h('div.connection-toolbar', {}, nav, button(t('Refresh'), () => run(reload))), status, body);
  function render() {
    if (!data) return;
    nav.replaceChildren(...(['servers', 'accounts', 'repositories'] as const).map((key) => button(t({ servers: 'Servers', accounts: 'Accounts', repositories: 'Repositories' }[key]), () => { pane = key; status.textContent = ''; render(); }, pane === key ? 'primary' : '')));
    body.replaceChildren();
    if (pane === 'servers') servers(); else if (pane === 'accounts') accounts(); else repositories();
  }
  function serverForm(old?: GitServer) {
    const name = h('input', { value: old?.name ?? '', maxlength: 100, placeholder: t('Connection name') }) as HTMLInputElement;
    const provider = select(t('Service'), [{ id: 'forgejo', name: 'Forgejo' }, { id: 'github', name: 'GitHub' }], old?.provider ?? 'forgejo');
    const url = h('input', { value: old?.url ?? '', type: 'url', placeholder: 'https://forgejo.example.org' }) as HTMLInputElement;
    provider.addEventListener('change', () => { if (!old) url.value = provider.value === 'github' ? 'https://github.com' : ''; });
    const form = h('div.connection-card', {}, h('h4', {}, old ? t('Edit server') : t('Add server')), field(t('Name'), name), field(t('Service'), provider), field(t('Server address'), url),
      button(t('Save server'), () => run(async () => { const saved = await request('server', { id: old?.id, name: name.value, provider: provider.value, url: url.value }); selectedServer = saved.id; await reload(); })));
    body.append(form);
  }
  function servers() {
    body.append(h('p.setting-note', {}, t('You can connect multiple Forgejo instances and multiple accounts on the same server.')));
    for (const server of data.servers) body.append(h('article.connection-card', {}, h('h4', {}, server.name), h('p', {}, server.provider === 'github' ? 'GitHub' : 'Forgejo'), h('code', {}, server.url),
      h('div.connection-actions', {}, button(t('Edit'), () => { body.replaceChildren(); serverForm(server); }), button(t('Remove'), () => confirmDialog(t('Remove server?'), server.name, t('Remove'), () => void run(async () => { await request('remove', { kind: 'server', id: server.id }); await reload(); }))))));
    if (!data.servers.length) body.append(h('p.empty', {}, t('No servers connected yet.')));
    serverForm();
  }
  function accountForm(old?: GitAccount) {
    if (!data.servers.length) { body.append(h('p.empty', {}, t('Add a server first.'))); return; }
    const server = select(t('Server'), data.servers, old?.serverId ?? selectedServer);
    if (old) server.disabled = true;
    const name = h('input', { value: old?.name ?? '', maxlength: 100, placeholder: t('Account label, for example Sources reader') }) as HTMLInputElement;
    const username = h('input', { value: old?.username ?? '', placeholder: t('Username, optional until verification'), autocomplete: 'off' }) as HTMLInputElement;
    const token = h('input', { type: 'password', autocomplete: 'new-password', placeholder: old ? t('Leave empty to keep the saved token') : t('Personal access token'), maxlength: 4096 }) as HTMLInputElement;
    const card = h('div.connection-card', {}, h('h4', {}, old ? t('Edit account') : t('Add account')), field(t('Server'), server), field(t('Account name'), name), field(t('Username'), username), field(t('Token'), token),
      button(t('Save account'), () => run(async () => { const saved = await request('account', { id: old?.id, serverId: server.value, name: name.value, username: username.value, token: token.value || undefined }); token.value = ''; selectedAccount = saved.id; selectedServer = server.value; await reload(); })),
      h('p.setting-note', {}, t('Credentials are saved on the server in a separate persistent file for each account. Saved tokens are never displayed.')));
    const web = button(t('Sign in with GitHub'), () => run(async () => {
      const result = await request('login', { serverId: server.value, name: name.value || t('GitHub account') }); login = result.flow;
      const waiting = h('div.connection-login', { role: 'status' }, t('Waiting for the sign-in page…'));
      card.append(waiting, button(t('Cancel sign-in'), () => run(async () => { if (login) await request('cancel-login', { flow: login }); login = undefined; clearTimeout(loginTimer); await reload(); })));
      const poll = async () => {
        if (!login || disposed) return;
        try {
          const response = await fetch('/api/connections?login=' + encodeURIComponent(login), { credentials: 'same-origin', cache: 'no-store' });
          const state = await response.json();
          if (!response.ok) throw Error(state.error);
          if (state.status === 'ok') { login = undefined; selectedAccount = state.accountId; await reload(); status.textContent = t('GitHub account connected'); return; }
          waiting.replaceChildren(state.pending?.url ? h('a', { href: state.pending.url, target: '_blank', rel: 'noopener noreferrer' }, t('Open GitHub authorization')) : t('Waiting for the sign-in page…'), state.pending?.code ? h('code.connection-device-code', {}, state.pending.code) : '', h('p', {}, state.error ?? t('Authorize the code in your browser. No terminal is required.')));
          loginTimer = setTimeout(() => void poll(), 2000);
        } catch (error) { waiting.textContent = remoteText((error as Error).message); login = undefined; }
      };
      void poll();
    }));
    const paint = () => { web.hidden = data.servers.find((s) => s.id === server.value)?.provider !== 'github'; };
    server.addEventListener('change', paint); paint(); card.append(web); body.append(card);
  }
  function accounts() {
    for (const account of data.accounts) body.append(h('article.connection-card', {}, h('h4', {}, account.name), h('p', {}, `${data.servers.find((s) => s.id === account.serverId)?.name} · ${account.username || t('Not verified')}`),
      h('p', { class: account.verifiedAt ? 'ok' : 'bad' }, account.verifiedAt ? t('Access verified') : account.error ?? t('Verification required')),
      h('div.connection-actions', {}, button(t('Verify access'), () => run(async () => { try { await request('verify', { accountId: account.id }); } finally { await reload(); } })),
        button(t('Edit'), () => { body.replaceChildren(); accountForm(account); }), button(t('Remove'), () => confirmDialog(t('Remove account?'), account.name, t('Remove'), () => void run(async () => { await request('remove', { kind: 'account', id: account.id }); await reload(); }))))));
    accountForm();
  }
  function repositories() {
    const verified = data.accounts.filter((a) => a.verifiedAt);
    if (!verified.length) { body.append(h('p.empty', {}, t('Add and verify an account first.'))); return; }
    const account = select(t('Account'), verified.map((a) => ({ id: a.id, name: `${data.servers.find((s) => s.id === a.serverId)?.name} · ${a.name} (${a.username})` })), selectedAccount);
    const filter = h('input', { placeholder: t('Filter repositories'), type: 'search' }) as HTMLInputElement;
    const rows = h('div.connection-repositories');
    let list: GitRepository[] = [];
    const paint = () => rows.replaceChildren(...list.filter((r) => (r.name + ' ' + r.description).toLowerCase().includes(filter.value.toLowerCase())).map((repo) => {
      const target = select(t('Existing office'), data.floors);
      const officeName = h('input', { placeholder: t('Name of the new office'), value: repo.name.split('/')[1] }) as HTMLInputElement;
      return h('article.connection-card', {}, h('h4', {}, repo.name), h('p', {}, repo.description), h('p', {}, repo.permissions.write ? t('Read and write access') : t('Read access')),
        button(t('Verify Git access'), () => run(async () => { const result = await request('git', { accountId: account.value, repository: repo.name }); status.textContent = result.write ? t('Git read access verified; server reports write permission') : t('Git read access verified'); })),
        data.floors.length ? field(t('Existing office'), target) : null,
        data.floors.length ? button(t('Link to office'), () => run(async () => { const floor = data.floors.find((f) => f.id === target.value)!; const old = data.bindings.find((b) => b.dir === floor.dir); await request('bind', { ...old, floorId: floor.id, accountId: account.value, repository: repo.name, roles: old?.roles ?? { lettura: account.value }, agents: old?.agents ?? {} }); await reload(); })) : null,
        field(t('New office'), officeName), button(t('Clone and create office'), () => confirmDialog(t('Create an office?'), repo.name, t('Clone and create office'), () => void run(async () => { await request('office', { accountId: account.value, repository: repo.name, name: officeName.value }); await reload(); }))));
    }));
    filter.addEventListener('input', paint);
    account.addEventListener('change', () => { selectedAccount = account.value; list = []; paint(); });
    body.append(field(t('Account'), account), button(t('Load remote repositories'), () => run(async () => { selectedAccount = account.value; list = (await request('repositories', { accountId: account.value })).repositories; paint(); })), filter, rows);
    body.append(h('h4', {}, t('Linked offices')), ...data.bindings.map((b) => h('p', {}, `${data.floors.find((f) => f.id === b.floorId)?.name ?? b.floorId} → ${b.repository} · ${data.accounts.find((a) => a.id === b.accountId)?.name ?? ''}${b.controlled ? ' · ' + t('Controlled document pipeline') : ''}`)));
  }
  void run(reload);
  return { element, dispose() { disposed = true; clearTimeout(loginTimer); if (login) void request('cancel-login', { flow: login }).catch(() => {}); } };
}
