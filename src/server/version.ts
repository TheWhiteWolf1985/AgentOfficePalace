import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read the running commit or package version without fetching or changing the installation. */
function runningVersion() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++, dir = path.dirname(dir)) {
    let pkg: { name?: string; version?: string };
    try { pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { continue; }
    if (pkg.name !== 'agent-office') continue;
    if (existsSync(path.join(dir, '.git'))) {
      try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* package version remains available */ }
    }
    return pkg.version ?? '0.0.0';
  }
  return '0.0.0';
}
export const applicationVersion = runningVersion();
