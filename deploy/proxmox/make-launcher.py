"""Render the self-contained Bash entry point for one qualified GitHub delivery."""
import hashlib
import json
import re
import sys
from pathlib import Path


def render(tag, delivery):
    manifest = (delivery / 'release.json').read_bytes()
    version = json.loads(manifest)['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(
            'v' + re.escape(version) + r'(?:-rc\.[1-9]\d*)?', tag):
        raise ValueError('Tag diverso dalla versione della consegna')
    digest = hashlib.sha256(manifest).hexdigest()
    source = Path(__file__).with_name('create_vm.py').read_text(encoding='utf-8')
    marker = 'AOP_PROXMOX_PYTHON'
    if marker in source.splitlines():
        raise ValueError('Delimitatore incorporato nel sorgente')
    target = delivery / 'proxmox.sh'
    target.write_text(f'#!/bin/bash\nset -eu\nexec python3 -u - {tag} {digest} "$@" <<\'{marker}\'\n'
                      f'{source.rstrip()}\n{marker}\n', encoding='utf-8', newline='\n')
    target.chmod(0o755)


if __name__ == '__main__':
    render(sys.argv[1], Path(sys.argv[2]))
