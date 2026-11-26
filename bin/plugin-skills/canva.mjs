// This client runs only in Plugin & Skills. Workers never choose a server or receive its credentials.
import { Problem } from './provider-http.mjs';

export const canvaEndpoint = 'https://api.canva.com/connect/v1/mcp';
const issuer = 'https://www.canva.com';
const invalid = () => new Problem(502, 'Invalid Canva MCP response.');
const metadataError = () => new Problem(502, 'Invalid Canva OAuth metadata.');
const protocols = ['2025-06-18', '2025-11-25', '2025-03-26'];
let current;

async function fetchCanva(url, options = {}, timeout = 12_000) {
  const target = new URL(url);
  if (!['https://api.canva.com', issuer].includes(target.origin) || target.username || target.password || target.hash) throw metadataError();
  try { return await fetch(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
  catch { throw new Problem(503, 'Canva is temporarily unavailable.'); }
}
async function success(response) {
  if (response.ok) return;
  await response.body?.cancel();
  if (response.status === 401) throw new Problem(401, 'Reconnect this account.');
  if (response.status === 403) throw new Problem(403, 'Canva denied this operation. Check account permissions.');
  if (response.status === 429) throw new Problem(429, 'Provider rate limit reached. Try again later.');
  throw new Problem(502, 'The provider rejected the request.');
}
async function text(response, limit = 2 * 1024 * 1024) {
  if (!response.body) throw invalid();
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks).toString('utf8');
      if ((size += value.length) > limit) throw invalid();
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
}
function json(value) { try { return JSON.parse(value); } catch { throw invalid(); } }

export async function canvaClient(clientId, secret) {
  const resourceResponse = await fetchCanva('https://api.canva.com/.well-known/oauth-protected-resource/connect/v1/mcp');
  await success(resourceResponse);
  const resource = json(await text(resourceResponse, 64 * 1024));
  if (resource.resource !== canvaEndpoint || !resource.authorization_servers?.includes(issuer) ||
      !Array.isArray(resource.scopes_supported) || !resource.scopes_supported.length || resource.scopes_supported.length > 64 ||
      resource.scopes_supported.some(s => typeof s !== 'string' || !/^[a-z][a-z0-9:_-]{0,100}$/.test(s))) throw metadataError();
  const configResponse = await fetchCanva(issuer + '/.well-known/oauth-authorization-server');
  await success(configResponse);
  const config = json(await text(configResponse, 64 * 1024));
  // Pin the authorization server as well as the MCP resource. Never follow a supplied issuer or URL.
  if (config.issuer !== issuer || config.authorization_endpoint !== issuer + '/api/oauth/authorize' ||
      config.token_endpoint !== 'https://api.canva.com/auth/v1/oauth/token' || !config.code_challenge_methods_supported?.includes('S256')) throw metadataError();
  return { kind: 'oauth', transport: 'mcp', clientId, secret, authorize: config.authorization_endpoint,
    token: config.token_endpoint, resource: canvaEndpoint, scope: resource.scopes_supported.join(' ') };
}

// Handles JSON and SSE, including chunked progress notifications before the matching response.
async function reply(response, id) {
  function result(value) {
    if (value?.jsonrpc !== '2.0' || value.id !== id || value.error || !value.result || typeof value.result !== 'object') throw invalid();
    return value.result;
  }
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) return result(json(await text(response)));
  if (!type.includes('text/event-stream') || !response.body) throw invalid();
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if ((size += value.length) > 2 * 1024 * 1024) throw invalid();
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = /\r?\n\r?\n/.exec(buffer))) {
        const data = buffer.slice(0, end.index).split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        buffer = buffer.slice(end.index + end[0].length);
        if (!data) continue;
        const message = json(data);
        if (message.id === id) return result(message);
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
  throw invalid();
}

class Connection {
  constructor(access) { this.access = access; this.nextId = 0; this.tools = undefined; }
  headers() {
    return { Authorization: 'Bearer ' + this.access, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
      ...(this.session ? { 'Mcp-Session-Id': this.session } : {}), ...(this.protocol ? { 'MCP-Protocol-Version': this.protocol } : {}) };
  }
  async post(message, timeout) {
    const response = await fetchCanva(canvaEndpoint, { method: 'POST', headers: this.headers(), body: JSON.stringify({ jsonrpc: '2.0', ...message }) }, timeout);
    if (response.status === 404 && this.session) {
      await response.body?.cancel();
      if (current === this) current = undefined;
      // A write might already have run. Never replay tools/call automatically.
      throw new Problem(409, 'Canva MCP session expired. Retry the operation.');
    }
    await success(response);
    return response;
  }
  async initialize() {
    const id = ++this.nextId;
    const response = await this.post({ id, method: 'initialize', params: { protocolVersion: protocols[0], capabilities: {},
      clientInfo: { name: 'Agent Office Palace', version: '1' } } });
    const session = response.headers.get('mcp-session-id');
    if (session && (!/^[\x21-\x7e]{1,256}$/.test(session))) { await response.body?.cancel(); throw invalid(); }
    this.session = session;
    const init = await reply(response, id);
    if (!protocols.includes(init.protocolVersion) || !init.capabilities?.tools) throw invalid();
    this.protocol = init.protocolVersion;
    const ack = await this.post({ method: 'notifications/initialized' });
    await ack.body?.cancel();
  }
  async request(method, params = {}) {
    const id = ++this.nextId;
    return reply(await this.post({ id, method, params }, method === 'tools/call' ? 60_000 : 12_000), id);
  }
  async catalogue() {
    if (this.tools && this.until > Date.now()) return this.tools;
    if (this.listing) return this.listing;
    this.listing = (async () => {
      const tools = [], cursors = new Set();
      let cursor;
      do {
        const page = await this.request('tools/list', cursor ? { cursor } : {});
        if (!Array.isArray(page.tools)) throw invalid();
        for (const tool of page.tools) {
          if (!tool || typeof tool.name !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(tool.name) ||
              tools.some(t => t.name === tool.name) || tool.inputSchema?.type !== 'object' ||
              (tool.description !== undefined && typeof tool.description !== 'string') || tools.length >= 256) throw invalid();
          tools.push({ name: tool.name, description: tool.description || tool.name, inputSchema: tool.inputSchema,
            ...(tool.annotations ? { annotations: tool.annotations } : {}) });
        }
        cursor = page.nextCursor;
        if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 4096 || cursors.has(cursor) || cursors.size >= 16)) throw invalid();
        if (cursor) cursors.add(cursor);
      } while (cursor);
      this.tools = tools; this.until = Date.now() + 60_000;
      return tools;
    })().finally(() => { this.listing = undefined; });
    return this.listing;
  }
  async close() {
    if (!this.session) return;
    await fetchCanva(canvaEndpoint, { method: 'DELETE', headers: this.headers() }, 3000).then(r => r.body?.cancel()).catch(() => {});
  }
}

export function resetCanva() {
  const old = current; current = undefined;
  if (old) void old.ready.then(() => old.close()).catch(() => {});
}
async function connection(access) {
  if (current?.access !== access) {
    resetCanva();
    const next = current = new Connection(access);
    next.ready = next.initialize().catch(error => { if (current === next) current = undefined; throw error; });
  }
  const active = current;
  await active.ready;
  return active;
}
export async function canvaTools(access) {
  return (await (await connection(access)).catalogue()).map(tool => ({ ...tool, name: 'canva.' + tool.name }));
}
export async function canvaCall(name, args, access) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Problem(400, 'Invalid tool arguments.');
  const client = await connection(access);
  if (!(await client.catalogue()).some(tool => 'canva.' + tool.name === name)) throw new Problem(404, 'Tool unavailable.');
  const result = await client.request('tools/call', { name: name.slice(6), arguments: args });
  if (!Array.isArray(result.content) || (result.isError !== undefined && typeof result.isError !== 'boolean')) throw invalid();
  return result;
}
