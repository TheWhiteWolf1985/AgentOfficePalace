import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.glb']);

/** Sidecars belong to the generated public directory; original assets are never rewritten. */
export async function precompressAssets(directory) {
  const root = path.resolve(directory);
  const result = { files: 0, originalBytes: 0, brBytes: 0, gzipBytes: 0 };
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile() || !COMPRESSIBLE.has(path.extname(entry.name).toLowerCase())) continue;
      const original = await readFile(file);
      let kept = false;
      for (const [extension, compress, total] of [
        ['br', () => brotliCompressSync(original, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), 'brBytes'],
        ['gz', () => gzipSync(original, { level: 9 }), 'gzipBytes'],
      ]) {
        const output = file + '.' + extension;
        const data = original.length >= 512 ? compress() : undefined;
        if (data && data.length + 32 < original.length) {
          await writeFile(output, data);
          result[total] += data.length; kept = true;
        } else {
          try { await unlink(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      if (kept) { result.files++; result.originalBytes += original.length; }
    }
  }
  if (!(await stat(root)).isDirectory()) throw new Error('Expected a generated public directory');
  await visit(root);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = process.argv[2] ?? fileURLToPath(new URL('../dist/public', import.meta.url));
  const result = await precompressAssets(directory);
  console.log('Precompressed public assets:', JSON.stringify(result));
}
