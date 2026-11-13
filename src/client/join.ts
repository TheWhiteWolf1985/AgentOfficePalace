import './i18n';
import { t as uiText, remoteText } from '../shared/i18n';
export {}; // a module, so its names don't clash with the other pages' scripts

// An invite link, /join#<token>: make your own account, then walk in. The token rides in the
// fragment, so it never reaches a server log or a Referer header.
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const token = location.hash.slice(1);
const form = $<HTMLFormElement>('form');
const name = $<HTMLInputElement>('name');
const password = $<HTMLInputElement>('password');
const again = $<HTMLInputElement>('again');
const submit = $<HTMLButtonElement>('submit');
const error = $('error');

function fail(msg: string) {
  $('sub').textContent = '';
  form.hidden = true;
  error.textContent = remoteText(msg);
  $('login').hidden = false;
}

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; body: any }> {
  const res = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

async function peek() {
  if (!token) return fail(uiText('This link is missing its invite code. Ask whoever sent it for the whole link.'));
  try {
    const r = await post({ peek: true });
    if (!r.ok) return fail(r.body.error ?? uiText('This invite link does not work.'));
    const { name: invited, role, by, project } = r.body as { name?: string; role: string; by: string; project: string };
    $('title').textContent = uiText`Join the ${project} office`;
    const sub = $('sub');
    sub.replaceChildren(uiText`${by} invited you${role === 'admin' ? uiText(' as an ') : '. '}`);
    if (role === 'admin') {
      const pill = document.createElement('span');
      pill.className = 'role';
      pill.textContent = 'admin';
      sub.append(pill, '.');
    }
    sub.append(uiText(' Make your own account to come in.'));
    if (invited) {
      name.value = invited;
      name.readOnly = true;
      name.title = uiText('The name you were invited under');
    }
    form.hidden = false;
    (invited ? password : name).focus();
  } catch {
    fail(uiText('Server unreachable.'));
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  if (password.value !== again.value) {
    error.textContent = remoteText(uiText("Those passwords don't match"));
    again.select();
    return;
  }
  submit.disabled = true;
  try {
    const r = await post({ name: name.value.trim(), password: password.value });
    if (!r.ok) {
      error.textContent = remoteText(r.body.error ?? uiText('Could not make your account'));
      return;
    }
    try {
      localStorage.setItem('agent-office.login-name', r.body.name);
    } catch {
      // storage blocked
    }
    location.replace('/');
  } catch {
    error.textContent = remoteText(uiText('Server unreachable'));
  } finally {
    submit.disabled = false;
  }
});

void peek();
