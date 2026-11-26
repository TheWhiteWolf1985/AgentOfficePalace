"""Check only first-party application files, before installing locked upstream dependencies."""
import gzip
import os
from pathlib import Path
import re
import subprocess
import sys

TOP = {'bin', 'dist', 'README.md', 'LICENSE', 'npm-shrinkwrap.json', 'package.json'}
PRIVATE = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32,}|'
                     rb'gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|'
                     rb'sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{36,}|ya29\.[A-Za-z0-9_-]{40,}|'
                     rb'AIza[0-9A-Za-z_-]{35}|GOCSPX-[A-Za-z0-9_-]{22,}')
FORBIDDEN = {'.git', '.ssh', '.codex', '.agent-office', '.config', 'auth.json', 'accounts.json', 'shared-codex',
             'connections.json', 'forgejo-identities', 'agent-admin-token', 'workers.json', 'floors.json', 'floor.json', 'sessions', 'authorized_keys',
             'known_hosts', '.git-credentials', '.npmrc', '.netrc', '.docker', 'id_ed25519', 'id_rsa'}
PERSONAL_PATH = re.compile(rb'(?:[A-Z]:[\\/]+Users[\\/]+(?!Public\b|Default\b)[\w.-]+[\\/]+(?:Documents|AppData)|'
                           rb'192\.168\.1\.(?:6|8|144)(?:[:/]\d|/[\w-]))', re.I)


def check(root, tracked):
    if {p.name for p in root.iterdir()} != TOP:
        raise ValueError('Contenuto inatteso nella radice del pacchetto')
    for path in root.rglob('*'):
        rel = path.relative_to(root)
        parts = {part.lower() for part in rel.parts}
        if (path.is_symlink() or parts & FORBIDDEN or any(part.startswith('.env') for part in parts)
                or path.suffix.lower() in {'.key', '.pem', '.pfx', '.p12', '.sqlite', '.db', '.log', '.bundle'}):
            raise ValueError('File riservato nel pacchetto: ' + str(rel))
        if path.is_dir():
            continue
        if rel.parts[0] == 'bin' and rel.as_posix() not in tracked:
            raise ValueError('File eseguibile estraneo al commit: ' + str(rel))
        if rel.parts[0] == 'dist' and (len(rel.parts) < 3 or rel.parts[1] not in ('public', 'server')):
            raise ValueError('Percorso estraneo alla build: ' + str(rel))
        if path.suffix == '.gz':
            data = gzip.decompress(path.read_bytes())
        elif path.suffix == '.br':
            if not path.with_suffix('').is_file():
                raise ValueError('Risorsa compressa priva di originale: ' + str(rel))
            continue
        else:
            data = path.read_bytes()
        if PRIVATE.search(data) or PERSONAL_PATH.search(data):
            raise ValueError('Possibile dato privato nel pacchetto: ' + str(rel))
    # npm pack must include every tracked helper needed at runtime.
    if tracked != {p.relative_to(root).as_posix() for p in (root / 'bin').rglob('*') if p.is_file()}:
        raise ValueError('Dotazione bin incompleta')


if __name__ == '__main__':
    tracked = set(os.fsdecode(subprocess.check_output(['git', 'ls-files', '-z', '--', 'bin'])).rstrip('\0').split('\0'))
    check(Path(sys.argv[1]), tracked)
