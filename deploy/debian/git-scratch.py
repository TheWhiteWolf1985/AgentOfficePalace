"""Private, disposable disk filesystems for Git transfers in rootless workers."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys
import tempfile

STORE = Path('/var/lib/agent-office-git')
LIMIT = 4 * 1024 ** 3


def command(*args):
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL)


def scratch(action, worker, uid, gid):
    if action not in ('prepare', 'release') or not isinstance(worker, str) or not re.fullmatch('[0-9a-f]{12}', worker):
        raise ValueError('Richiesta di spazio Git non valida')
    # Root owns all path components and the lock. Never open worker-controlled paths as root.
    STORE.mkdir(mode=0o711, exist_ok=True)
    target = STORE / worker
    with (STORE / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        mounted = target.is_mount()
        if action == 'release':
            if mounted:
                command('/usr/bin/umount', target)
            if target.exists():
                target.rmdir()
            return
        if mounted:
            return
        target.mkdir(mode=0o000, exist_ok=True)
        # Only the loop device holds the anonymous backing file. Even a VM restart
        # cannot leave a 4 GiB orphan. Discard returns deleted blocks to the host.
        with tempfile.TemporaryFile(dir=STORE) as backing:
            backing.truncate(LIMIT)
            image = f'/proc/{os.getpid()}/fd/{backing.fileno()}'
            command('/usr/sbin/mkfs.ext4', '-q', '-F', '-m', '0', '-i', '65536',
                    '-O', '^has_journal', '-E', f'root_owner={uid}:{gid}', image)
            command('/usr/bin/mount', '-t', 'ext4', '-o', 'loop,discard,nosuid,nodev,noexec', image, target)
            try:
                target.chmod(0o700)
            except BaseException:
                command('/usr/bin/umount', target)
                raise


def serve():
    try:
        line = sys.stdin.buffer.readline(128)
        if not line.endswith(b'\n'):
            raise ValueError('Richiesta di spazio Git incompleta')
        action, worker = line.decode('ascii').strip().split()
        user = pwd.getpwnam('agentoffice')
        scratch(action, worker, user.pw_uid, user.pw_gid)
        result = {'ok': True}
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(exc, file=sys.stderr)
        result = {'error': 'Spazio temporaneo Git su disco non disponibile. Controllare lo spazio della VM.'}
    print(json.dumps(result))


if __name__ == '__main__':
    serve()
