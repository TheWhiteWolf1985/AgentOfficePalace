"""Exercise the release image with the real capped filesystem and a read-only container."""
import argparse
import os
from pathlib import Path
import pwd
import runpy
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image')
    parser.add_argument('--rootless', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    uid = pwd.getpwnam('agentoffice').pw_uid if args.rootless else 0
    gid = pwd.getpwnam('agentoffice').pw_gid if args.rootless else 0
    docker = (['runuser', '-u', 'agentoffice', '--', 'docker', '--host', f'unix:///run/user/{uid}/aop-docker.sock']
              if args.rootless else ['docker'])
    scratch = runpy.run_path(str(root / 'deploy/debian/git-scratch.py'))['scratch']
    with tempfile.TemporaryDirectory(dir='/var/tmp', prefix='office-git-test-') as temp:
        folder = Path(temp)
        folder.chmod(0o711)
        store = folder / 'scratch'
        scratch.__globals__['STORE'] = store
        worker = '123456789abc'
        workspace = folder / 'workspace'
        workspace.mkdir(mode=0o700)
        os.chown(workspace, uid, gid)
        scratch('prepare', worker, uid, gid)
        try:
            scratch('prepare', worker, uid, gid)
            other = 'abcdef012345'
            scratch('prepare', other, uid, gid)
            try:
                assert (store / other).stat().st_dev != (store / worker).stat().st_dev
            finally:
                scratch('release', other, uid, gid)
            subprocess.run([*docker, 'run', '--rm', '--network=none', '--cap-drop=ALL', '--read-only',
                            '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
                            '-v', f'{workspace}:/workspace', '-v', f'{store/worker}:/tmp/office-git',
                            '-v', f'{root}/bin/office-forgejo.cjs:/qa/office-forgejo.cjs:ro',
                            '-v', f'{root}/tests/fixtures/git-scratch.cjs:/qa/test.cjs:ro',
                            '--entrypoint', 'node', args.image, '/qa/test.cjs'], check=True, timeout=600)
        finally:
            scratch('release', worker, uid, gid)
        assert not (store / worker).exists()


if __name__ == '__main__':
    main()
