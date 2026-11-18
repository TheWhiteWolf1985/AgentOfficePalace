import { accessSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, 'dist', 'server');
const config = path.join(root, 'tsconfig.server.json');
const typescript = createRequire(import.meta.url).resolve('typescript/package.json');
const compiler = path.join(path.dirname(typescript), 'bin', 'tsc');
accessSync(compiler);
const configured = JSON.parse(readFileSync(config, 'utf8')).compilerOptions?.outDir;
if (typeof configured !== 'string' || path.relative(output, path.resolve(root, configured))) {
  throw new Error('The server output must remain dist/server');
}

// Only generated server output is replaceable; reject redirected or unexpected directories.
for (const directory of [path.join(root, 'dist'), output]) {
  const stat = lstatSync(directory, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(directory, realpathSync(directory)))) {
    throw new Error(`Refusing to clean unexpected build path: ${directory}`);
  }
}
rmSync(output, { recursive: true, force: true });
const result = spawnSync(process.execPath, [compiler, '-p', config], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
