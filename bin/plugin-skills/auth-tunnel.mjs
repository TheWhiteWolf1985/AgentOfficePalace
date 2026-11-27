import { randomBytes } from 'node:crypto';
import { chmodSync, readdirSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { Problem } from './providers.mjs';

// Only reviewed OAuth return addresses belong here. This module is private to the broker.
const profiles = new Map(['drive', 'heygen', 'canva'].map(id => [id, new URL('http://127.0.0.1:4600/api/plugins/callback/' + id)]));
const filename = /^auth-[a-f0-9]{16}\.sock$/;
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const callbacks = new Map();

// This separate listener serves callback handlers only, never the broker API.
// Docker publishes it on VM loopback. sshd permits office-tunnel this destination only.
export async function startCallbackGateway(port = 4610, host = '0.0.0.0') {
  const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
    const pathname = req.url?.split('?')[0];
    const handler = callbacks.get(pathname);
    if (!handler) return res.writeHead(404, { 'Cache-Control': 'no-store', Connection: 'close' }).end();
    handler(req, res);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 8_000;
  server.maxConnections = 16;
  server.setTimeout(10_000, connection => connection.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

export function removeStaleCallbacks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSocket() && filename.test(entry.name)) unlinkSync(path.join(directory, entry.name));
  }
}

export function tunnelProfile(id, origin) {
  const redirect = profiles.get(id);
  const office = new URL(origin);
  if (!redirect || office.origin !== origin || office.protocol !== 'https:' || !isIP(office.hostname.replace(/^\[|\]$/g, ''))) {
    throw new Problem(400, 'Unsupported sign-in tunnel.');
  }
  return { redirect, office };
}

// One private Unix socket for one OAuth response. No Office or broker routes are served here.
export async function openCallback({ profile, directory, hostDirectory, authorization, state, until }) {
  const { redirect, office } = profile;
  const name = 'auth-' + randomBytes(8).toString('hex') + '.sock';
  const file = path.join(directory, name);
  const hostFile = path.posix.join(hostDirectory, name);
  if (!/^\/[A-Za-z0-9_./-]+$/.test(hostFile) || Buffer.byteLength(hostFile) > 107 || Buffer.byteLength(file) > 107) {
    throw new Problem(503, 'Unsupported callback socket path.');
  }
  const receipt = randomBytes(32).toString('base64url');
  const start = randomBytes(24).toString('base64url');
  let received = false, code, closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (callbacks.get(redirect.pathname) === handler) callbacks.delete(redirect.pathname);
    server.close();
    server.closeAllConnections();
  };
  const handler = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Connection', 'close');
    if (closed || received || Date.now() >= until || req.method !== 'GET' || req.headers.host !== redirect.host ||
        !req.url?.startsWith(redirect.pathname + '?')) return res.writeHead(404).end();
    const values = new URL(req.url, redirect.origin).searchParams;
    if (values.size === 1 && values.get('probe') === start) return res.writeHead(204).end();
    if (values.size === 1 && values.get('start') === start) return res.writeHead(303, { Location: authorization }).end();
    const codes = values.getAll('code'), errors = values.getAll('error');
    if (values.getAll('state').length !== 1 || values.get('state') !== state || codes.length + errors.length !== 1 ||
        !(codes[0] || errors[0]) || (codes[0]?.length ?? 0) > 4096) return res.writeHead(400).end();
    received = true;
    code = codes[0];
    // Return to the initiating Office browser. Google credentials never enter this redirect.
    res.writeHead(303, { Location: office.origin + redirect.pathname + '?receipt=' + receipt });
    res.end(close);
  };
  const server = http.createServer({ maxHeaderSize: 8192 }, handler);
  server.requestTimeout = 10_000;
  server.headersTimeout = 8_000;
  server.maxConnections = 8;
  server.setTimeout(10_000, connection => connection.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(file, resolve);
  });
  try { chmodSync(file, 0o600); } catch (error) { close(); throw error; }
  callbacks.set(redirect.pathname, handler);
  // No remote command/session. The PC probes this one flow and terminates its own SSH process.
  const args = ['-F', 'none', '-N', '-T', '-a', '-x', '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2', '-o', 'ConnectTimeout=15',
    '-o', 'StrictHostKeyChecking=ask', '-o', 'PreferredAuthentications=password',
    '-L', redirect.host + ':127.0.0.1:4610', '-l', 'office-tunnel', office.hostname.replace(/^\[|\]$/g, '')];
  const command = "$aopSsh = Start-Process -FilePath ssh.exe -NoNewWindow -PassThru -ArgumentList @(" + args.map(quote).join(',') + "); " +
    "$aopReady = $false; try { while (!$aopSsh.HasExited -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt " + until + ") { " +
    "try { $aopProbe = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 -Uri " + quote(redirect.href + '?probe=' + start) + "; " +
    "if ($aopProbe.StatusCode -eq 204 -and !$aopReady) { Write-Host 'Tunnel-OK'; $aopReady = $true } } " +
    "catch { if ($aopReady) { break } }; Start-Sleep -Seconds 1 } } finally { " +
    "if (!$aopSsh.HasExited) { $aopSsh.Kill() }; Remove-Variable aopSsh,aopReady,aopProbe -ErrorAction SilentlyContinue }";
  return { close, command, url: redirect.href + '?start=' + start, get received() { return received; }, redeem(value) {
    if (!received || receipt !== value) throw new Problem(400, 'Sign-in expired or belongs to another browser.');
    return code;
  } };
}
