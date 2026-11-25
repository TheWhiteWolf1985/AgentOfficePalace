// The broker is the only MCP client. Desk agents may check availability, but never submit an upstream method.
import { Problem, readLimited } from './provider-http.mjs';

const endpoint = 'https://mcp.heygen.com/mcp/v1/';
const origin = new URL(endpoint).origin;
const protocol = '2025-06-18';
function trusted(value) {
  if (typeof value !== 'string' && !(value instanceof URL)) throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
  let url;
  try { url = new URL(value); } catch { throw new Problem(502, 'Invalid HeyGen OAuth metadata.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !/(^|\.)(heygen\.com|heygen\.ai)$/.test(url.hostname)) throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
  return url;
}

async function fetchHeyGen(url, options = {}) {
  try { return await fetch(trusted(url), { ...options, redirect: 'error', signal: AbortSignal.timeout(8000) }); }
  catch (error) { if (error instanceof Problem) throw error; throw new Problem(503, 'HeyGen is temporarily unavailable.'); }
}
function success(response) {
  if (response.status === 401) throw new Problem(401, 'Reconnect this account.');
  if (response.status === 429) throw new Problem(429, 'Provider rate limit reached. Try again later.');
  if (!response.ok) throw new Problem(502, 'The provider rejected the request.');
}

async function metadata(urls) {
  for (const url of urls) {
    const r = await fetchHeyGen(url, { headers: { Accept: 'application/json' } });
    if (r.status === 404 || r.status === 405) { await r.body?.cancel(); continue; }
    success(r);
    return JSON.parse(await readLimited(r));
  }
  throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
}

export async function heygenClient(redirect, saved) {
  const challenge = await fetchHeyGen(endpoint, { headers: { Accept: 'text/event-stream' } });
  const hint = /\bresource_metadata="([^"]+)"/i.exec(challenge.headers.get('www-authenticate') || '')?.[1];
  await challenge.body?.cancel();
  const resource = await metadata(hint ? [hint] : [origin + '/.well-known/oauth-protected-resource/mcp/v1/', origin + '/.well-known/oauth-protected-resource']);
  const target = trusted(resource.resource);
  if (target.origin !== origin || target.search ||
      !(endpoint === target.href || endpoint.startsWith(target.href.replace(/\/$/, '') + '/'))) throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
  const issuer = trusted(resource.authorization_servers?.[0]);
  const suffix = issuer.pathname.replace(/\/$/, '');
  const config = await metadata([issuer.origin + '/.well-known/oauth-authorization-server' + suffix,
    issuer.origin + '/.well-known/openid-configuration' + suffix, issuer.origin + suffix + '/.well-known/openid-configuration']);
  if (config.issuer !== resource.authorization_servers[0]) throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
  const authorize = trusted(config.authorization_endpoint).href, token = trusted(config.token_endpoint).href;
  let clientId = saved?.redirect === redirect && saved.issuer === config.issuer ? saved.clientId : undefined;
  if (!clientId) {
    if (!config.registration_endpoint) throw new Problem(502, 'HeyGen did not offer client registration.');
    const r = await fetchHeyGen(config.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Agent Office Palace', redirect_uris: [redirect], grant_types: config.grant_types_supported?.includes('refresh_token') === false ? ['authorization_code'] : ['authorization_code', 'refresh_token'],
        response_types: ['code'], token_endpoint_auth_method: 'none' }) });
    success(r);
    const registered = JSON.parse(await readLimited(r));
    if (typeof registered.client_id !== 'string' || !registered.client_id || (registered.token_endpoint_auth_method && registered.token_endpoint_auth_method !== 'none')) throw new Problem(502, 'Invalid HeyGen OAuth metadata.');
    clientId = registered.client_id;
  }
  const scopes = [...(resource.scopes_supported || [])];
  if (config.scopes_supported?.includes('offline_access') && !scopes.includes('offline_access')) scopes.push('offline_access');
  return { kind: 'oauth', clientId, redirect, issuer: config.issuer, authorize, token, resource: target.href, scope: scopes.join(' ') };
}

// Streamable HTTP permits JSON or a stream of SSE events. Stop reading immediately after the reply.
async function rpcReply(response, id) {
  const json = response.headers.get('content-type')?.includes('application/json');
  function result(value) {
    if (value?.jsonrpc !== '2.0' || value.id !== id || value.error || value.result == null) throw new Problem(502, 'Invalid HeyGen MCP response.');
    return value.result;
  }
  if (json) return result(JSON.parse(await readLimited(response)));
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Problem(502, 'Invalid HeyGen MCP response.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, buffer = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if ((size += chunk.value.length) > 1024 * 1024) throw new Problem(502, 'Invalid HeyGen MCP response.');
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = /\r?\n\r?\n/.exec(buffer))) {
        const data = buffer.slice(0, end.index).split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        buffer = buffer.slice(end.index + end[0].length);
        if (!data) continue;
        const value = JSON.parse(data);
        if (value.id === id) return result(value);
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
  throw new Problem(502, 'Invalid HeyGen MCP response.');
}

export async function heygenStatus(access) {
  const headers = { Authorization: 'Bearer ' + access, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
  const post = body => fetchHeyGen(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', ...body }) });
  const first = await post({ id: 1, method: 'initialize', params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'Agent Office Palace', version: '1' } } });
  success(first);
  const session = first.headers.get('mcp-session-id');
  if (session) headers['Mcp-Session-Id'] = session;
  try {
    const init = await rpcReply(first, 1);
    if (!['2025-11-25','2025-06-18','2025-03-26'].includes(init.protocolVersion) || !init.capabilities?.tools) throw new Problem(502, 'Invalid HeyGen MCP response.');
    headers['MCP-Protocol-Version'] = init.protocolVersion;
    const ack = await post({ method: 'notifications/initialized' }); success(ack); await ack.body?.cancel();
    const listed = await post({ id: 2, method: 'tools/list', params: {} }); success(listed);
    const page = await rpcReply(listed, 2);
    if (!Array.isArray(page.tools)) throw new Problem(502, 'Invalid HeyGen MCP response.');
    return { connected: true, provider: 'HeyGen' };
  } finally {
    if (session) await fetchHeyGen(endpoint, { method: 'DELETE', headers }).then(r => r.body?.cancel()).catch(() => {});
  }
}
