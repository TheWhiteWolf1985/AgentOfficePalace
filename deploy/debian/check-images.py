"""Reject user state even if later Docker layers hide or remove it."""
import json
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile
import tempfile


def check(archive):
    # Read docker save once. Reused base layers are inspected once per delivery.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with tarfile.open(archive, 'r|gz') as bundle:
            for item in bundle:
                if not item.isfile():
                    continue
                path = PurePosixPath(item.name)
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError('Percorso inatteso nell’archivio immagini')
                target = root / str(path)
                target.parent.mkdir(exist_ok=True, parents=True)
                with target.open('xb') as out:
                    shutil.copyfileobj(bundle.extractfile(item), out)
        entries = json.loads((root / 'manifest.json').read_text())
        if len(entries) != 2:
            raise ValueError('Attese le due immagini di base')
        layers = set()
        for image in entries:
            parts = [PurePosixPath(p) for p in [image['Config'], *image['Layers']]]
            if any(p.is_absolute() or '..' in p.parts for p in parts):
                raise ValueError('Manifest con percorso non valido')
            cfg = json.loads((root / str(parts[0])).read_text())
            for row in cfg['config'].get('Env') or []:
                if any(k in row.split('=', 1)[0].upper() for k in ('PASSWORD', 'API_KEY', 'SECRET', 'TOKEN')):
                    raise ValueError('Credenziale di ambiente preconfigurata')
            layers.update(parts[1:])
        for layer in layers:
            with tarfile.open(root / str(layer), 'r|*') as contents:
                for item in contents:
                    if item.isdir():
                        continue
                    parts = PurePosixPath(item.name).parts
                    if (parts[:1] in [('workspace',), ('data',), ('office-drops',), ('office-bridge',)]
                            or parts[:2] in [('root', '.codex'), ('root', '.ssh'), ('root', '.git-credentials')]
                            or parts[:3] == ('root', '.config', 'gh')):
                        raise ValueError('Stato utente in un layer: ' + item.name)
        print(f'{len(entries)} immagini e {len(layers)} layer controllati')


if __name__ == '__main__':
    check(sys.argv[1])
