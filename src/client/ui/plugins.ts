import { remoteText, t } from '../../shared/i18n';
import { googleDriveSignInOrigin } from '../../shared/google-drive-oauth';
import { connectionButton as button, connectionField as field } from './connections-client';
import { h } from './dom';

type SignInTunnel = { url: string; command: string; until: number };
type CanvaFolderPolicy = { configured: boolean; folderId: string; folderName: string; error?: string;
  pending: { id: string; stage: string; reason?: string; currentAccount: boolean; outputIds: string[] }[] };
type Provider = { id: 'drive' | 'canva' | 'linkedin' | 'heygen'; name: string; account?: string; hasClient: boolean; clientIssue?: string; tunnel?: SignInTunnel; policy?: CanvaFolderPolicy; status: 'connected' | 'disconnected' | 'reconnect' };
type Catalogue = { providers: Provider[]; skills: { id: string; name: string; description: string; enabled: boolean }[] };
const descriptions = {
  drive: 'Find files and read Google Docs or text documents.',
  canva: 'Use the official Canva MCP tools to search, create, edit and export designs.',
  heygen: 'Verify access to HeyGen with your web account.',
  linkedin: 'Read the connected LinkedIn member profile.',
};
const labels = { connected: 'Connected', disconnected: 'Disconnected', reconnect: 'Reconnect this account.' };

async function request<T>(input?: object): Promise<T> {
  const response = await fetch('/api/plugins', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), credentials: 'same-origin' } : { cache: 'no-store', credentials: 'same-origin' });
  const value = await response.json();
  if (!response.ok) throw Error(remoteText(value.code || value.error || 'Plugin & Skills service unavailable.'));
  return value;
}

export function pluginsPanel() {
  const message = h('p.setting-note', { role: 'status', 'aria-live': 'polite' });
  const body = h('div.connections');
  const credentials = h('div');
  const accountButton = button(t('Show tunnel credentials'), () => run(async () => {
    const account = await request<{ user: string; password: string; fingerprint: string }>({ action: 'tunnel-account' });
    if (closed) return;
    const password = h('input', { readOnly: true, type: 'password', autocomplete: 'off', value: account.password });
    credentials.replaceChildren(field(t('SSH user'), h('code', {}, account.user)), field(t('SSH password'), password),
      button(t('Show password'), () => { password.type = password.type === 'password' ? 'text' : 'password'; }),
      field(t('SSH host fingerprint'), h('code', {}, account.fingerprint)),
      button(t('Hide credentials'), () => credentials.replaceChildren()));
    message.textContent = '';
  }));
  const refresh = button(t('Refresh'), () => load());
  const element = h('section.connections', {}, refresh, accountButton, credentials, message, body);
  let closed = false, busy = false, waiting = false, generation = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  async function load() {
    if (closed || busy) return;
    const version = ++generation;
    try {
      const view = await request<Catalogue>();
      if (closed || version !== generation) return;
      render(view); message.textContent = '';
    } catch (e) {
      if (closed || version !== generation) return;
      body.replaceChildren();
      message.textContent = (e as Error).message;
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy || closed) return;
    ++generation; busy = true; body.inert = true; refresh.disabled = true;
    message.textContent = t('Working…');
    try { await action(); }
    catch (e) { if (!closed) message.textContent = (e as Error).message; }
    finally { busy = false; body.inert = false; refresh.disabled = false; }
  }
  async function change(input: object) {
    const view = await request<Catalogue>(input);
    if (!closed) { render(view); message.textContent = t('Settings applied'); }
  }
  function googleAccount(p: Provider) {
    const origin = googleDriveSignInOrigin(location.origin);
    const ready = p.hasClient && !p.clientIssue;
    const client = h('input', { autocomplete: 'off', maxlength: 1024, placeholder: p.hasClient ? t('Leave blank to keep the saved client ID') : '' });
    const secret = h('input', { autocomplete: 'new-password', type: 'password', maxlength: 2048 });
    const setup = h('details', { open: !ready }, h('summary', {}, t('Google application setup')),
      p.clientIssue && h('p.setting-note', { role: 'alert' }, remoteText(p.clientIssue)),
      h('p.setting-note', {}, t('Enable the Drive API and register a web application with this redirect URL.')),
      h('code', {}, origin + '/api/plugins/callback/drive'),
      h('p', {}, h('a', { href: 'https://console.cloud.google.com/auth/clients', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud Console')),
      field('Client ID', client), field('Client secret', secret),
      button(t('Apply'), () => run(async () => {
        await change({ action: 'drive-client', clientId: client.value.trim(), secret: secret.value });
        secret.value = '';
      })));
    return h('div', {}, setup, sharedSignIn(p, ready));
  }
  function sharedSignIn(p: Provider, ready: boolean) {
    const loginLabel = t(p.id === 'heygen' ? 'Sign in with HeyGen' : p.id === 'canva' ? 'Sign in with Canva' : 'Sign in with Google');
    if (googleDriveSignInOrigin(location.origin) !== location.origin) {
      const controls = h('div');
      function show(session?: SignInTunnel) {
        if (!session) {
          const prepare = button(t('Prepare sign-in tunnel'), () => run(async () => {
            const plan = await request<SignInTunnel>({ action: 'prepare-tunnel', id: p.id });
            if (!closed) { show(plan); message.textContent = ''; }
          }));
          prepare.disabled = !ready;
          controls.replaceChildren(prepare);
          return;
        }
        const command = h('textarea', { readOnly: true, rows: 3, 'aria-label': 'PowerShell' });
        command.value = session.command;
        const expiryTime = new Date(session.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const signIn = h('a.btn', { href: session.url, target: '_blank', rel: 'noopener noreferrer' }, loginLabel);
        signIn.addEventListener('click', () => { waiting = true; });
        controls.replaceChildren(
          h('p', {}, t('Run this command in PowerShell on this computer. Use the dedicated office-tunnel password.')),
          command, button(t('Copy command'), async () => {
            try { await navigator.clipboard.writeText(session!.command); message.textContent = t('Command copied.'); }
            catch { command.focus(); command.select(); message.textContent = t('Press Ctrl+C to copy the command.'); }
          }),
          h('p', {}, t('When PowerShell shows Tunnel-OK, continue signing in from this browser.')),
          signIn, button(t('Cancel sign-in'), () => run(() => change({ action: 'cancel-tunnel', id: p.id }))),
          h('p.setting-note', {}, t('The tunnel closes after sign-in or cancellation. Expires at'), ' ', expiryTime));
        clearTimeout(expiry);
        expiry = setTimeout(() => { if (!closed) void load(); }, Math.max(1, session.until - Date.now() + 100));
      }
      show(p.tunnel);
      return controls;
    }
    const login = button(loginLabel, () => {
      // Open on the user's click; async requests otherwise trigger popup blockers.
      const popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      return run(async () => {
        try {
          const result = await request<{ url: string }>({ action: 'begin', id: p.id });
          if (closed) { popup?.close(); return; }
          waiting = true;
          const link = h('a', { href: result.url, target: '_blank', rel: 'noopener noreferrer' }, t('Open sign-in page'));
          message.replaceChildren(link);
          if (popup && !popup.closed) popup.location.replace(result.url);
        } catch (error) { popup?.close(); throw error; }
      });
    });
    login.disabled = !ready;
    return login;
  }
  function canvaAccount(p: Provider) {
    const client = h('input', { autocomplete: 'off', maxlength: 1024, placeholder: p.hasClient ? t('Leave blank to keep the saved client ID') : '' });
    const secret = h('input', { autocomplete: 'new-password', type: 'password', maxlength: 2048 });
    const setup = h('details', { open: !p.hasClient || !!p.clientIssue }, h('summary', {}, t('Canva MCP application setup')),
      p.clientIssue && h('p.setting-note', { role: 'alert' }, remoteText(p.clientIssue)),
      h('p.setting-note', {}, t('Enable Canva MCP in Outside Canva. Register this address under Redirect URLs, not Return URL.')),
      h('code', {}, googleDriveSignInOrigin(location.origin) + '/api/plugins/callback/canva'),
      h('p', {}, h('a', { href: 'https://www.canva.com/developers/apps', target: '_blank', rel: 'noopener noreferrer' }, 'Canva Developers')),
      field('Client ID', client), field('Client secret', secret),
      button(t('Apply'), () => run(async () => {
        await change({ action: 'canva-client', clientId: client.value.trim(), secret: secret.value });
        secret.value = '';
      })));
    return h('div', {}, setup, sharedSignIn(p, p.hasClient), p.status === 'connected' && canvaFolder(p));
  }
  function canvaFolder(p: Provider) {
    const policy = p.policy;
    const folderId = h('input', { value: policy?.folderId ?? '', autocomplete: 'off', maxlength: 180 });
    const folderName = h('input', { value: policy?.folderName || 'AI_MARKETING', autocomplete: 'off', maxlength: 180 });
    const form = h('details', { open: !policy?.configured }, h('summary', {}, t('Canva write folder')),
      h('p.setting-note', {}, t('Existing designs outside this folder are read-only. New designs are created, moved here automatically and verified.')),
      h('p.setting-note', {}, t(policy?.configured ? 'Canva folder protection is active for all agents.' : 'Choose and verify a folder to enable Canva writes.')),
      field(t('Canva folder name'), folderName), field(t('Canva folder ID'), folderId),
      button(t('Apply'), () => run(() => change({ action: 'canva-policy', folderId: folderId.value.trim(), folderName: folderName.value.trim() }))));
    if (policy?.error) form.append(h('p.setting-note', { role: 'alert' }, remoteText(policy.error)));
    for (const entry of policy?.pending ?? []) {
      form.append(h('div.setting', {}, h('strong', {}, t('Pending Canva creation')), h('code', {}, entry.id),
        h('p', {}, remoteText(entry.reason || entry.stage)),
        entry.outputIds.length ? h('p', {}, entry.outputIds.join(', ')) : undefined,
        entry.currentAccount && button(t('Check pending creation'), () => run(() => change({ action: 'canva-reconcile', operationId: entry.id })))));
    }
    return form;
  }
  function provider(p: Provider) {
    const panel = h('section.setting', {}, h('h4', {}, p.name),
      h('p.setting-note', {}, t(descriptions[p.id])),
      h('p', {}, t(labels[p.status]), p.account ? ' · ' + p.account : ''),
      p.id === 'drive' ? googleAccount(p) : p.id === 'canva' ? canvaAccount(p) : p.id === 'heygen' ? sharedSignIn(p, true) : oauthAccount(p));
    if (p.status !== 'disconnected') panel.append(button(t('Disconnect account'), () => {
      if (window.confirm(t('Disconnect this account for all agents?'))) return run(() => change({ action: 'disconnect', id: p.id }));
    }));
    return panel;
  }
  function oauthAccount(p: Provider) {
    const redirect = location.origin + '/api/plugins/callback/' + p.id;
    const client = h('input', { autocomplete: 'off', type: 'text', maxlength: 1024 });
    const secret = h('input', { autocomplete: 'new-password', type: 'password', maxlength: 2048 });
    const options = h('details', {}, h('summary', {}, t('OAuth application')),
      field('Client ID', client), field('Client secret', secret),
      h('p.setting-note', {}, t('Register this redirect URL with the provider.'), ' ', h('code', {}, redirect)));
    options.open = !p.hasClient;
    const form = h('details', {}, h('summary', {}, t(p.status === 'disconnected' ? 'Connect account' : 'Reconnect account')), options);
    const authorize = button(t('Sign in with provider'), () => run(async () => {
      const result = await request<{ url: string }>({ action: 'begin', id: p.id, clientId: client.value.trim(), secret: secret.value });
      secret.value = '';
      if (closed) return;
      waiting = true;
      const link = h('a.btn', { href: result.url, target: '_blank', rel: 'noopener noreferrer' }, t('Open sign-in page'));
      message.replaceChildren(link);
      link.focus();
    }));
    form.append(authorize);
    return form;
  }
  function render(view: Catalogue) {
    clearTimeout(expiry);
    body.replaceChildren(...view.providers.map(provider), h('h4', {}, t('Skills')),
      ...view.skills.map(skill => h('section.setting', {}, h('strong', {}, skill.name),
        h('p.setting-note', {}, t(skill.description)),
        button(t(skill.enabled ? 'Disable skill' : 'Enable skill'), () => run(() => change({ action: 'skill', id: skill.id, enabled: !skill.enabled }))))));
  }
  const onFocus = () => { if (waiting && !closed && !busy) { waiting = false; void load(); } };
  window.addEventListener('focus', onFocus);
  return { element, load, dispose() { closed = true; credentials.replaceChildren(); clearTimeout(expiry); window.removeEventListener('focus', onFocus); } };
}
