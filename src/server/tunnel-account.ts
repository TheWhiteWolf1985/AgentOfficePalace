import { readFile } from 'node:fs/promises';

/** Read only for an explicit, authenticated administrator request. Never part of the plugin catalogue. */
export async function tunnelAccount() {
  const file = process.env.AGENT_OFFICE_TUNNEL_CONFIG || '/etc/agent-office-tunnel/account.json';
  const value = JSON.parse(await readFile(file, 'utf8'));
  if (value.user !== 'office-tunnel' || !/^[A-Za-z0-9_-]{40,80}$/.test(value.password) ||
      !/^SHA256:[A-Za-z0-9+/]{43}$/.test(value.fingerprint)) throw Error('Invalid tunnel account');
  return { user: value.user, password: value.password, fingerprint: value.fingerprint };
}
