import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { canvaCall, canvaClient, canvaEndpoint, canvaTools, resetCanva } from '../bin/plugin-skills/canva.mjs';
import { begin, exchange, operations } from '../bin/plugin-skills/providers.mjs';
import { buildRequest, handleMcp } from '../bin/office-workers.js';

const schema = { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false };
const tool = { name: 'search-designs', description: 'Search Canva designs', inputSchema: schema, annotations: { readOnlyHint: true } };
afterEach(() => resetCanva());

function metadata(url: string) {
  return url.includes('oauth-protected-resource')
    ? { resource: canvaEndpoint, authorization_servers: ['https://www.canva.com'], scopes_supported: ['profile:read', 'design:content:write'] }
    : { issuer: 'https://www.canva.com', authorization_endpoint: 'https://www.canva.com/api/oauth/authorize',
      token_endpoint: 'https://api.canva.com/auth/v1/oauth/token', code_challenge_methods_supported: ['S256'] };
}

test('Canva discovers MCP OAuth, binds PKCE/resource and exchanges and refreshes at the MCP token endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async (url: URL | string, opts: RequestInit) => {
    assert.equal(opts.redirect, 'error');
    if (!String(url).endsWith('/token')) return Response.json(metadata(String(url)));
    assert.equal(String(url), 'https://api.canva.com/auth/v1/oauth/token');
    assert.equal(new Headers(opts.headers).get('authorization'), 'Basic ' + Buffer.from('client:secret').toString('base64'));
    const body = opts.body as URLSearchParams;
    assert.equal(body.get('resource'), canvaEndpoint);
    assert.equal(body.has('client_secret'), false);
    return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
  });
  const client = await canvaClient('client', 'secret');
  const flow = begin('canva', client.clientId, 'https://office.example.org/api/plugins/callback/canva', client);
  const url = new URL(flow.url);
  assert.equal(url.searchParams.get('scope'), 'profile:read design:content:write');
  assert.equal(url.searchParams.get('resource'), canvaEndpoint);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), flow.state);
  assert.equal((await exchange('canva', client, { grant_type: 'authorization_code', code: 'fixture', code_verifier: flow.verifier })).access, 'test-access');
  assert.equal((await exchange('canva', client, { grant_type: 'refresh_token', refresh_token: 'test-refresh' })).refresh, 'test-refresh');
  assert.equal(operations.some((t: { name: string }) => t.name.startsWith('canva.')), false);
  await assert.rejects(exchange('canva', { ...client, transport: undefined }, {}), /Reconnect Canva/);
});

for (const field of ['resource', 'issuer', 'authorize', 'token', 'pkce', 'scope']) test('Canva rejects untrusted OAuth metadata: ' + field, async t => {
  t.mock.method(globalThis, 'fetch', async (url: URL | string) => {
    assert.ok(['api.canva.com', 'www.canva.com'].includes(new URL(url).hostname));
    const value: any = metadata(String(url));
    if (field === 'resource' && value.resource) value.resource = 'https://other.invalid/mcp';
    if (field === 'issuer' && value.authorization_servers) value.authorization_servers = ['https://other.invalid'];
    if (field === 'authorize' && value.authorization_endpoint) value.authorization_endpoint = 'https://canva.com.attacker.invalid/auth';
    if (field === 'token' && value.token_endpoint) value.token_endpoint = 'http://127.0.0.1/token';
    if (field === 'pkce' && value.code_challenge_methods_supported) value.code_challenge_methods_supported = ['plain'];
    if (field === 'scope' && value.scopes_supported) value.scopes_supported = ['profile:read secret'];
    return Response.json(value);
  });
  await assert.rejects(canvaClient('client', 'secret'), /Invalid Canva OAuth metadata/);
});

for (const sse of [false, true]) test('Canva lists paginated schemas and calls advertised tools over ' + (sse ? 'SSE' : 'JSON'), async t => {
  const calls: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, opts: RequestInit) => {
    assert.equal(url.href, canvaEndpoint); assert.equal(opts.redirect, 'error');
    const headers = new Headers(opts.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture');
    if (opts.method === 'DELETE') return new Response(null, { status: 204 });
    const request = JSON.parse(String(opts.body)); calls.push(request);
    if (request.method === 'initialize') return Response.json({ jsonrpc: '2.0', id: request.id,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }, { headers: { 'Mcp-Session-Id': 'session' } });
    assert.equal(headers.get('Mcp-Session-Id'), 'session'); assert.equal(headers.get('MCP-Protocol-Version'), '2025-06-18');
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    let result;
    if (request.method === 'tools/list') result = request.params.cursor
      ? { tools: [{ ...tool, name: 'export-design' }] } : { tools: [tool], nextCursor: 'next-page' };
    else {
      assert.equal(request.method, 'tools/call'); assert.equal(request.params.name, 'search-designs');
      assert.deepEqual(request.params.arguments, { query: 'Report' });
      result = { content: [{ type: 'text', text: 'No designs found' }], structuredContent: { designs: [] }, isError: false };
    }
    const message = { jsonrpc: '2.0', id: request.id, result };
    if (!sse) return Response.json(message);
    const event = 'event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\r\n\r\ndata: ' + JSON.stringify(message) + '\r\n\r\n';
    return new Response(new ReadableStream({ start(c) {
      for (let i = 0; i < event.length; i += 17) c.enqueue(new TextEncoder().encode(event.slice(i, i + 17)));
      c.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  const [first, second] = await Promise.all([canvaTools('fixture'), canvaTools('fixture')]);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0], { ...tool, name: 'canva.search-designs' });
  assert.equal(calls.filter(r => r.method === 'initialize').length, 1);
  assert.deepEqual(calls.filter(r => r.method === 'tools/list').map(r => r.params), [{}, { cursor: 'next-page' }]);
  assert.deepEqual((await canvaCall('canva.search-designs', { query: 'Report' }, 'fixture')).structuredContent, { designs: [] });
  await assert.rejects(canvaCall('canva.nonexistent', {}, 'fixture'), /Tool unavailable/);
  await assert.rejects(canvaCall('canva.search-designs', [], 'fixture'), /Invalid tool arguments/);
  assert.equal(calls.filter(r => r.method === 'tools/call').length, 1);
});

for (const fault of ['duplicate', 'schema', 'cursor', 'rpc', 'oversize', '401', '403', '429', '404', 'network'])
  test('Canva fails safely without replaying operations: ' + fault, async t => {
    let invocations = 0;
    t.mock.method(globalThis, 'fetch', async (_url: URL, opts: RequestInit) => {
      if (opts.method === 'DELETE') return new Response(null, { status: 204 });
      const request = JSON.parse(String(opts.body));
      if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (request.method === 'initialize') return Response.json({ jsonrpc: '2.0', id: request.id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } }, { headers: { 'Mcp-Session-Id': 'test' } });
      if (request.method === 'tools/list') {
        const result = fault === 'duplicate' ? { tools: [tool, tool] } : fault === 'schema' ? { tools: [{ ...tool, inputSchema: {} }] }
          : fault === 'cursor' ? { tools: [], nextCursor: 'same' } : { tools: [tool] };
        return Response.json({ jsonrpc: '2.0', id: request.id, result });
      }
      invocations++;
      if (fault === 'network') throw Error('secret upstream diagnostic');
      if (fault === 'oversize') return new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } });
      if (fault === 'rpc') return Response.json({ jsonrpc: '2.0', id: request.id, error: { code: -32602, message: 'secret upstream diagnostic' } });
      return new Response(null, { status: Number(fault) });
    });
    await assert.rejects(canvaCall('canva.search-designs', {}, 'fixture'), (error: any) => {
      assert.doesNotMatch(error.message, /secret upstream/); return true;
    });
    assert.ok(invocations <= 1);
  });

test('Canva preserves tool errors and structured content, and replaces the session on token rotation', async t => {
  const tokens: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: URL, opts: RequestInit) => {
    if (opts.method === 'DELETE') return new Response(null, { status: 204 });
    const request = JSON.parse(String(opts.body));
    if (request.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (request.method === 'initialize') tokens.push(new Headers(opts.headers).get('authorization')!);
    const result = request.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
      : request.method === 'tools/list' ? { tools: [tool] }
      : { content: [{ type: 'text', text: 'Design is read only' }], structuredContent: { code: 'forbidden' }, isError: true };
    return Response.json({ jsonrpc: '2.0', id: request.id, result });
  });
  const result = await canvaCall('canva.search-designs', {}, 'first');
  assert.equal(result.isError, true); assert.equal(result.structuredContent.code, 'forbidden');
  await canvaTools('second');
  assert.deepEqual(tokens, ['Bearer first', 'Bearer second']);
});

test('the Office bridge allows enough time for generation without changing ordinary operations', () => {
  const office = { url: 'http://localhost:4600', worker: 'fixture', token: 'fixture' };
  assert.equal(buildRequest('use', office, { name: 'canva.generate-design', arguments: {} }).timeout, 95_000);
  assert.equal(buildRequest('use', office, { name: 'drive.search', arguments: {} }).timeout, 26_000);
  assert.equal(buildRequest('tools', office, {}).timeout, 60_000);
});

test('the agent MCP bridge preserves Canva content, images, structured data and tool errors', async () => {
  const result = { content: [{ type: 'text', text: 'Preview' }, { type: 'image', data: 'fixture', mimeType: 'image/png' }],
    structuredContent: { designs: [] }, isError: true };
  const response = await handleMcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
    name: 'use_office_tool', arguments: { name: 'canva.generate-design', arguments: { prompt: 'Fictitious design' } },
  } }, { env: { AGENT_OFFICE_HOOK_URL: 'http://localhost:4600', AGENT_OFFICE_WORKER_ID: 'fixture', AGENT_OFFICE_HOOK_TOKEN: 'fixture' },
    fetch: async () => ({ status: 200, text: async () => JSON.stringify(result) }) });
  assert.deepEqual(response.result, result);
});
