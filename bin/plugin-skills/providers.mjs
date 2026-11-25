import { createHash, randomBytes, sign } from 'node:crypto';

import { Problem, readLimited } from './provider-http.mjs';
import { heygenStatus } from './heygen.mjs';
export { Problem };

const driveApi = 'https://www.googleapis.com/drive/v3';
const canvaApi = 'https://api.canva.com/rest/v1';
export const providers = new Map([
  ['drive', {
    name: 'Google Drive', authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive.readonly',
  }],
  ['heygen', { name: 'HeyGen' }],
  ['linkedin', {
    name: 'LinkedIn', authorize: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken', scope: 'openid profile',
  }],
  ['canva', {
    name: 'Canva', authorize: 'https://www.canva.com/api/oauth/authorize',
    token: canvaApi + '/oauth/token', scope: 'profile:read design:meta:read',
  }],
]);

export function string(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Problem(400, label);
  return value.trim();
}

// Older Google clients can have a different secret format. Reject obvious copy/paste errors.
export function googleSecretIssue(secret, clientId) {
  if (typeof secret !== 'string' || !secret.trim()) return 'OAuth client secret required.';
  if (/^https?:\/\//i.test(secret.trim())) return 'The Google client secret field contains a web address. Paste the full client secret from Google Cloud.';
  if (secret.trim() === clientId || /[*•●]{3,}/u.test(secret)) return 'Paste the full client secret for this Google web application.';
}

async function remote(url, options, plain = false) {
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(9000) });
    if (!response.ok) {
      // Never forward provider diagnostics. They can contain account or request information.
      const errorBody = await readLimited(response);
      let reason;
      try { reason = JSON.parse(errorBody).error; } catch { /* provider sent plain text */ }
      if (url === providers.get('drive').token) {
        if (reason === 'invalid_client' || reason === 'deleted_client') throw new Problem(401, 'Google rejected the OAuth client credentials. Check the client ID and its active client secret in Google Cloud.');
        if (reason === 'invalid_grant' && options.body.get('grant_type') === 'authorization_code') throw new Problem(400, 'Google rejected the sign-in code. Start a new Google sign-in from Plugin & Skills.');
      }
      if (reason === 'invalid_grant' || response.status === 401) throw new Problem(401, 'Reconnect this account.');
      if (response.status === 429) throw new Problem(429, 'Provider rate limit reached. Try again later.');
      if (response.status === 403 || response.status === 404) throw new Problem(response.status, 'The provider denied access or the item was not found.');
      throw new Problem(502, 'The provider rejected the request.');
    }
    const text = await readLimited(response);
    return plain ? text : JSON.parse(text);
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw new Problem(503, 'The provider is temporarily unavailable.');
  }
}

export function begin(id, clientId, redirect, spec = providers.get(id)) {
  const verifier = randomBytes(64).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const url = new URL(spec.authorize);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code',
    scope: spec.scope, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256' }).toString();
  if (!spec.scope) url.searchParams.delete('scope');
  if (id === 'heygen') url.searchParams.set('resource', spec.resource);
  if (id === 'drive') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account consent');
  }
  return { url: url.href, verifier, state };
}

export async function exchange(id, account, params) {
  const body = new URLSearchParams(params);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (account.kind !== 'service') {
    if (id === 'heygen') { body.set('client_id', account.clientId); body.set('resource', account.resource); }
    else if (id === 'canva') headers.Authorization = 'Basic ' + Buffer.from(account.clientId + ':' + account.secret).toString('base64');
    else { body.set('client_id', account.clientId); body.set('client_secret', account.secret); }
  }
  if (id === 'drive' && account.kind !== 'service') {
    const issue = googleSecretIssue(account.secret, account.clientId);
    if (issue) throw new Problem(400, issue);
  }
  const result = await remote(id === 'heygen' ? account.token : providers.get(id).token, { method: 'POST', headers, body });
  if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Problem(502, 'Invalid token response.');
  return { access: result.access_token, expires: Date.now() + result.expires_in * 1000, refresh: result.refresh_token || account.refresh };
}

export function accessGrant(account) {
  if (account.kind !== 'service') return { grant_type: 'refresh_token', refresh_token: account.refresh };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: account.email, scope: providers.get('drive').scope, aud: providers.get('drive').token, iat: now, exp: now + 3600 };
  const data = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode(claims);
  let signature;
  try { signature = sign('RSA-SHA256', Buffer.from(data), account.key).toString('base64url'); }
  catch { throw new Problem(400, 'Invalid service account key.'); }
  return { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: data + '.' + signature };
}

const get = (url, access, plain) => remote(url, { headers: { Authorization: 'Bearer ' + access } }, plain);
async function linkedInProfile(access) {
  const data = await get('https://api.linkedin.com/v2/userinfo', access);
  return { id: string(data.sub, 320, 'Account identity unavailable.'), name: string(data.name || data.given_name || data.sub, 320, 'Account identity unavailable.') };
}

export async function identity(id, access) {
  if (id === 'heygen') return (await heygenStatus(access)).provider;
  if (id === 'linkedin') return (await linkedInProfile(access)).name;
  if (id === 'drive') {
    const data = await get(driveApi + '/about?fields=user(emailAddress,displayName)', access);
    return string(data.user?.emailAddress || data.user?.displayName, 320, 'Account identity unavailable.');
  }
  const data = await get(canvaApi + '/users/me/profile', access);
  return string(data.profile?.display_name, 320, 'Account identity unavailable.');
}

// Operations are a closed catalogue. Neither URLs, credentials nor request headers come from agents.
export const operations = [
  { name: 'drive.search', description: 'List or search accessible files by name. Optional query and pageToken (strings).' },
  { name: 'drive.read', description: 'Read one Google Doc or text/Markdown file up to 256 KiB. Required fileId (string).' },
  { name: 'heygen.status', description: 'Verify the shared HeyGen connection. No arguments. Does not generate a video.' },
  { name: 'linkedin.profile', description: 'Read the name and ID of the connected LinkedIn member. No arguments.' },
  { name: 'canva.search', description: 'List or search designs by title. Optional query and pageToken (strings).' },
  { name: 'canva.profile', description: 'Read the display name of the connected Canva account. No arguments.' },
  { name: 'canva.get', description: 'Read design metadata and links. Required designId (string).' },
];
export async function invoke(name, args, access) {
  if (name === 'canva.profile') return { name: await identity('canva', access) };
  if (name === 'heygen.status') return heygenStatus(access);
  if (name === 'linkedin.profile') return linkedInProfile(access);
  if (name === 'drive.search' || name === 'canva.search') {
    const drive = name === 'drive.search';
    const url = new URL(drive ? driveApi + '/files' : canvaApi + '/designs');
    const query = args.query === undefined ? '' : string(args.query, 256, 'Invalid query.');
    if (drive) {
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,webViewLink)');
      url.searchParams.set('pageSize', '40');
      url.searchParams.set('q', query ? "trashed = false and name contains '" + query.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : 'trashed = false');
    } else if (query) url.searchParams.set('query', query);
    if (args.pageToken !== undefined) url.searchParams.set(drive ? 'pageToken' : 'continuation', string(args.pageToken, 4096, 'Invalid page token.'));
    return get(url, access);
  }
  if (name !== 'drive.read' && name !== 'canva.get') throw new Problem(404, 'Tool unavailable.');
  const drive = name === 'drive.read';
  const id = drive ? args.fileId : args.designId;
  if (typeof id !== 'string' || !/^[\w-]{1,256}$/.test(id)) throw new Problem(400, 'Invalid item ID.');
  if (!drive) return get(canvaApi + '/designs/' + id, access);
  const url = driveApi + '/files/' + id;
  const meta = await get(url + '?fields=name,mimeType', access);
  if (meta.mimeType === 'application/vnd.google-apps.document') return { name: meta.name, text: await get(url + '/export?mimeType=text%2Fplain', access, true) };
  if (!meta.mimeType?.startsWith('text/')) throw new Problem(415, 'Only Google Docs and text files can be read.');
  return { name: meta.name, text: await get(url + '?alt=media', access, true) };
}
