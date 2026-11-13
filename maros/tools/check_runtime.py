#!/usr/bin/env python3
"""Confronta il runtime VM111 con il commit pubblicato, senza modificare file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

REMOTE = 'ssh://git@192.168.1.59/J.Zanella/AgentOfficePalace.git'


def command(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=60)


def compare_files(mapping):
    errors = []
    for source, target in mapping:
        if not source.is_file() or not target.is_file():
            errors.append('File mancante: ' + str(target))
        elif source.read_bytes() != target.read_bytes():
            errors.append('Contenuto diverso: ' + str(target))
        elif os.name == 'posix' and source.stat().st_mode & 0o111 and not target.stat().st_mode & 0o111:
            errors.append('Permesso di esecuzione mancante: ' + str(target))
    return errors


def runtime_mapping(repo, root, tracked):
    mapping = [(repo / n, root / n.removeprefix('maros/')) for n in tracked if n.startswith('maros/pipeline/')]
    mapping += [
        (repo / 'maros/deploy/compose.vm111.yml', root / 'docker-compose.yml'),
        (repo / 'maros/deploy/compose.forgejo.vm111.yml', root.parent / 'forgejo/docker-compose.yml'),
        (repo / 'maros/agents/AGENTS.md', root / 'data/home/.codex/AGENTS.md'),
    ]
    mapping += [(repo / n, root / Path(n).name) for n in tracked if n.startswith('maros/deploy/live/')]
    return mapping


def extra_pipeline_files(root, mapping):
    expected = {target for _, target in mapping}
    return [str(p) for p in (root / 'pipeline').rglob('*')
            if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc' and p not in expected]


def check(repo, root, image):
    git = ['git', '-C', str(repo)]
    head = command(*git, 'rev-parse', 'HEAD').decode().strip()
    errors = []
    if command(*git, 'status', '--porcelain').strip():
        errors.append('Il checkout contiene modifiche non committate')
    if command(*git, 'remote', 'get-url', 'origin').decode().strip() != REMOTE:
        errors.append('origin non corrisponde al repository aziendale')
    remote = command(*git, 'ls-remote', '--heads', 'origin', 'refs/heads/main').decode().split()
    if len(remote) != 2 or remote[0] != head:
        errors.append('HEAD non coincide con main pubblicato su Forgejo')
    tracked = command(*git, 'ls-files', '-z').decode().rstrip('\0').split('\0')
    mapping = runtime_mapping(repo, root, tracked)
    errors += compare_files(mapping)
    errors += ['File operativo non versionato: ' + p for p in extra_pipeline_files(root, mapping)]
    image_files = 0
    if image:
        names = [n for n in tracked if n.startswith(('src/', 'bin/')) or n in ('package.json', 'package-lock.json')]
        script = ("import json,sys,hashlib;from pathlib import Path;root=Path('/opt/agent-office');"
                  "names=json.load(sys.stdin);print(json.dumps({n:hashlib.sha256((root/n).read_bytes()).hexdigest() "
                  "if (root/n).is_file() else None for n in names}))")
        docker = ['docker'] if os.geteuid() == 0 else ['sudo', '-n', 'docker']
        raw = subprocess.run([*docker, 'exec', '-i', 'agent-office', 'python3', '-B', '-c', script],
                             input=json.dumps(names).encode(), capture_output=True, check=True, timeout=60)
        actual = json.loads(raw.stdout)
        errors += ['File del container diverso: ' + n for n in names
                   if actual.get(n) != hashlib.sha256((repo/n).read_bytes()).hexdigest()]
        image_files = len(names)
    return {'passed': not errors, 'commit': head, 'runtime_files': len(mapping),
            'image_source_files': image_files, 'errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/srv/data/agent-office'))
    parser.add_argument('--check-image', action='store_true')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    try:
        result = check(repo, args.root.resolve(), args.check_image)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        result = {'passed': False, 'errors': ['Verifica non completata: ' + str(error)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
