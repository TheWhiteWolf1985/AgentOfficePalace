import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { CodexAccount, CodexAccounts } from '../../shared/connections.js';
import { dockerHome, dockerPrefix, runningCodexContainers } from './docker.js';

const exec = promisify(execFile);
const maxAuthBytes = 128 * 1024;

/** Display metadata only. Token claims never authorize an office user. */
export function displayAccount(auth: Record<string, unknown>): CodexAccount {
  if (!auth || typeof auth !== 'object') return 'unknown';
  const tokens = auth.tokens as { id_token?: unknown; access_token?: unknown } | null;
  if (auth.auth_mode === 'apikey' || (!auth.auth_mode && auth.OPENAI_API_KEY)) return { method: 'api-key' };
  if (auth.auth_mode !== 'chatgpt' && !(tokens?.access_token && !auth.auth_mode)) return 'unknown';
  let email: string | undefined;
  if (typeof tokens?.id_token === 'string') {
    try {
      const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
      if (typeof payload.email === 'string' && /^[^\s@<>\p{C}]+@[^\s@<>\p{C}]+$/u.test(payload.email) && payload.email.length <= 254) email = payload.email;
    } catch { /* The CLI can still identify the sign-in method. */ }
  }
  return { method: 'chatgpt', email };
}

/** On the Linux Docker host the private HOME mount is fixed; its contents are worker-writable.
 * Pin the directory and refuse symlinks, special files and oversized input. */
async function configuredAccount(id: string): Promise<CodexAccount> {
  let dir: FileHandle | undefined, file: FileHandle | undefined;
  try {
    dir = await open(dockerHome(id), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    file = await open(path.join('/proc/self/fd', String(dir.fd), 'auth.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const meta = await file.stat();
    if (!meta.isFile() || meta.nlink !== 1 || meta.size < 2 || meta.size > maxAuthBytes) return 'unknown';
    const buffer = Buffer.alloc(meta.size);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return bytesRead === meta.size ? displayAccount(JSON.parse(buffer.toString())) : 'unknown';
  } catch (err) { return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'signed-out' : 'unknown'; }
  finally { await file?.close(); await dir?.close(); }
}

/** The CLI may print part of an API key. Neither its output nor command errors leave this module. */
async function activeAccount(cid: string, configured: CodexAccount): Promise<CodexAccount> {
  try {
    const { stdout, stderr } = await exec('docker', [...dockerPrefix(), 'exec', '--workdir=/tmp', cid, 'codex', 'login', 'status'],
      { timeout: 5000, maxBuffer: 8192 });
    const status = stdout + stderr;
    if (/logged in.*chatgpt/i.test(status)) return typeof configured === 'object' && configured.method === 'chatgpt' ? configured : { method: 'chatgpt' };
    if (/logged in.*api key/i.test(status)) return { method: 'api-key' };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    if (/not logged in/i.test(String(e.stdout ?? '') + String(e.stderr ?? ''))) return 'signed-out';
  }
  return 'unknown';
}

export async function codexAccounts(ids: string[]): Promise<Record<string, CodexAccounts>> {
  if (!ids.length) return {};
  const running = await runningCodexContainers().catch(() => undefined);
  const accounts: Record<string, CodexAccounts> = {};
  for (let start = 0; start < ids.length; start += 4) {
    await Promise.all(ids.slice(start, start + 4).map(async id => {
      const configured = await configuredAccount(id);
      const cid = running?.get(id);
      accounts[id] = { configured, active: cid ? await activeAccount(cid, configured) : running ? 'stopped' : 'unknown' };
    }));
  }
  return accounts;
}
