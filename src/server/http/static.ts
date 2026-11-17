// The client bundle: finding it, and serving its files.
import type http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
};

export function findPublicDir(): string {
  // Two folders up from here, as from server.ts before it: src/ under tsx, dist/server/ once built.
  const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const candidates = [path.resolve(here, '../../public'), path.resolve(here, '../../dist/public')];
  for (const c of candidates) if (existsSync(path.join(c, 'index.html'))) return c;
  throw new Error(`Client bundle not found (looked in ${candidates.join(', ')}). Run \`npm run build\`.`);
}

/** Negotiation follows RFC9110 section12.5.3; equal supported qualities prefer Brotli. */
export function assetEncoding(header: string | undefined, available: readonly string[]): string | undefined {
  if (!header?.trim()) return 'identity';
  const weights = new Map<string, number>();
  for (const item of header.split(',')) {
    const [rawToken, ...parameters] = item.trim().toLowerCase().split(';');
    const token = rawToken.trim();
    if (!token) continue;
    const quality = parameters.map(p => p.trim()).find(p => /^q\s*=/.test(p));
    const raw = quality?.split('=')[1]?.trim();
    const q = raw === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw) ? Number(raw) : 0;
    weights.set(token, Math.min(weights.get(token) ?? 1, q));
  }
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1);
  let selected = identity > 0 ? 'identity' : undefined;
  let best = weights.has('identity') ? identity : 0;
  for (const encoding of available) {
    const q = weights.get(encoding) ?? weights.get('*') ?? 0;
    if (q > 0 && (q > best || (q === best && selected === 'identity'))) { selected = encoding; best = q; }
  }
  return selected;
}

export function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: boolean) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }).end(); return; }
  const variants = new Map<string, { file: string; size: number }>();
  for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz'], ['identity', '']]) {
    try { const info = statSync(file + suffix); if (info.isFile()) variants.set(encoding, { file: file + suffix, size: info.size }); } catch { /* Missing sidecars use the original. */ }
  }
  res.setHeader('Vary', 'Accept-Encoding');
  if (!variants.has('identity')) { res.writeHead(404).end(); return; }
  const encoding = assetEncoding(req.headers['accept-encoding'], [...variants.keys()].filter(v => v !== 'identity'));
  if (!encoding) { res.writeHead(406, { 'cache-control': 'no-store' }).end(); return; }
  const selected = variants.get(encoding)!;
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': cache ? 'public, max-age=31536000, immutable' : 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-length': selected.size,
    ...(encoding !== 'identity' ? { 'content-encoding': encoding } : {}),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(selected.file);
  stream.on('error', () => res.destroy());
  res.once('close', () => stream.destroy());
  stream.pipe(res);
}

/** A file of the client bundle, or undefined when it's missing, a folder, or outside the bundle. */
export function publicFile(publicDir: string, p: string): string | undefined {
  if (/\.(?:gz|br)$/i.test(p)) return undefined; // Sidecars are selected via headers, never separate URLs.
  const file = path.join(publicDir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  return file.startsWith(publicDir + path.sep) && existsSync(file) && statSync(file).isFile() ? file : undefined;
}
