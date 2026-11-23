import { remoteText, t } from '../../shared/i18n';
import { googleDriveSignInOrigin } from '../../shared/google-drive-oauth';
import { connectionButton as button, connectionField as field } from './connections-client';
import { h } from './dom';

type Provider = { id: 'drive' | 'canva'; name: string; account?: string; hasClient: boolean; status: 'connected' | 'disconnected' | 'reconnect' };
type Catalogue = { providers: Provider[]; skills: { id: string; name: string; description: string; enabled: boolean }[] };
const labels = { connected: 'Connected', disconnected: 'Disconnected', reconnect: 'Reconnect this account.' };

async function request<T>(input?: object): Promise<T> {
  const response = await fetch('/api/plugins', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), credentials: 'same-origin' } : { cache: 'no-store', credentials: 'same-origin' });
  const value = await response.json();
  if (!response.ok) throw Error(remoteText(value.error || 'Plugin & Skills service unavailable.'));
  return value;
}

export function pluginsPanel() {
  const message = h('p.setting-note', { role: 'status', 'aria-live': 'polite' });
  const body = h('div.connections');
  const refresh = button(t('Refresh'), () => load());
  const element = h('section.connections', {}, refresh, message, body);
  let closed = false, busy = false, waiting = false, generation = 0;
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
    const client = h('input', { autocomplete: 'off', maxlength: 1024 });
    const secret = h('input', { autocomplete: 'new-password', type: 'password', maxlength: 2048 });
    const setup = h('details', { open: !p.hasClient }, h('summary', {}, t('Google application setup')),
      h('p.setting-note', {}, t('Enable the Drive API and register a web application with this redirect URL.')),
      h('code', {}, origin + '/api/plugins/callback/drive'),
      h('p', {}, h('a', { href: 'https://console.cloud.google.com/auth/clients', target: '_blank', rel: 'noopener noreferrer' }, 'Google Cloud Console')),
      field('Client ID', client), field('Client secret', secret),
      button(t('Apply'), () => run(async () => {
        await change({ action: 'drive-client', clientId: client.value.trim(), secret: secret.value });
        secret.value = '';
      })));
    if (origin !== location.origin) {
      return h('div', {}, setup,
        h('details', { open: p.hasClient }, h('summary', {}, t('Sign in with Google')),
          h('p.setting-note', {}, t('For this IP address, open an SSH tunnel on the computer where you will sign in. Replace USER with your VM SSH username.')),
          h('code', {}, 'ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:4600:127.0.0.1:4600 USER@' + location.hostname),
          h('p', {}, h('a.btn', { href: origin + '/lite', target: '_blank', rel: 'noopener noreferrer' }, t('Open local Office'))),
          h('p.setting-note', {}, t('In local Office, open Settings → Plugin & Skills and select Sign in with Google. Close the tunnel after consent.'))));
    }
    const login = button(t('Sign in with Google'), () => {
      // Open on the user's click; async requests otherwise trigger popup blockers.
      const popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      return run(async () => {
        try {
          const result = await request<{ url: string }>({ action: 'begin', id: 'drive' });
          if (closed) { popup?.close(); return; }
          waiting = true;
          const link = h('a', { href: result.url, target: '_blank', rel: 'noopener noreferrer' }, t('Open sign-in page'));
          message.replaceChildren(link);
          if (popup && !popup.closed) popup.location.replace(result.url);
        } catch (error) { popup?.close(); throw error; }
      });
    });
    login.disabled = !p.hasClient;
    return h('div', {}, setup, login);
  }
  function provider(p: Provider) {
    const panel = h('section.setting', {}, h('h4', {}, p.name),
      h('p.setting-note', {}, t(p.id === 'drive' ? 'Find files and read Google Docs or text documents.' : 'Find designs and read their details and links.')),
      h('p', {}, t(labels[p.status]), p.account ? ' · ' + p.account : ''),
      p.id === 'drive' ? googleAccount(p) : canvaAccount(p));
    if (p.status !== 'disconnected') panel.append(button(t('Disconnect account'), () => {
      if (window.confirm(t('Disconnect this account for all agents?'))) return run(() => change({ action: 'disconnect', id: p.id }));
    }));
    return panel;
  }
  function canvaAccount(p: Provider) {
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
    body.replaceChildren(...view.providers.map(provider), h('h4', {}, t('Skills')),
      ...view.skills.map(skill => h('section.setting', {}, h('strong', {}, skill.name),
        h('p.setting-note', {}, t(skill.description)),
        button(t(skill.enabled ? 'Disable skill' : 'Enable skill'), () => run(() => change({ action: 'skill', id: skill.id, enabled: !skill.enabled }))))));
  }
  const onFocus = () => { if (waiting && !closed && !busy) { waiting = false; void load(); } };
  window.addEventListener('focus', onFocus);
  return { element, load, dispose() { closed = true; window.removeEventListener('focus', onFocus); } };
}
