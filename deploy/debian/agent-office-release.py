#!/usr/bin/python3
"""Install and maintain the stable Agent Office Palace release on Debian 13 amd64."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

APP = 'agent-office-palace'
ROOT = Path('/opt') / APP
ETC = Path('/etc/agent-office-release')
HOME = Path('/var/lib') / APP
UNIT = Path('/etc/systemd/system')
TOOL = Path('/usr/local/sbin/agent-office-release')
USER = 'agentoffice'
REPO = 'TheWhiteWolf1985/AgentOfficePalace'
ARCHIVE = 'agent-office-linux-amd64.tgz'
IMAGE = 'codex-agent-linux-amd64.tgz'
MANAGER = 'agent-office-release.py'
TIMER = APP + '-update.timer'
SERVICE = APP + '.service'
TAG = re.compile(r'v[0-9]+\.[0-9]+\.[0-9]+')
SHA = re.compile(r'[a-f0-9]{64}')
SLOT = re.compile(TAG.pattern + r'(?:-[a-f0-9]{64})?')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def atomic(path, data, mode=0o644):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        os.fchmod(f.fileno(), mode)
        f.write(data.encode())
    os.replace(f.name, path)


def link(path, target):
    tmp = path.with_name('.' + path.name + '.new')
    tmp.unlink(missing_ok=True)
    tmp.symlink_to(target)
    os.replace(tmp, path)


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        if not url.startswith('https://'):
            raise ValueError('Redirect HTTPS richiesto')
        redirected = super().redirect_request(req, fp, code, msg, headers, url)
        if redirected and redirected.host != req.host:
            redirected.remove_header('Authorization')
        return redirected


class Release:
    def __init__(self, offline):
        self.directory = offline
        if offline:
            self.manifest = json.loads((offline / 'release.json').read_text())
        else:
            self.opener = urllib.request.build_opener(Redirect)
            self.headers = {'User-Agent': 'AgentOfficePalace-updater', 'Accept': 'application/vnd.github+json'}
            token = ETC / 'github-token'
            if token.exists():
                self.headers['Authorization'] = 'Bearer ' + token.read_text().strip()
            with self.get(f'https://api.github.com/repos/{REPO}/releases/latest') as r:
                release = json.load(r)
            if release['draft'] or release['prerelease'] or not TAG.fullmatch(release['tag_name']):
                raise ValueError('Release stabile non valida')
            self.assets = {a['name']: a for a in release['assets']}
            if 'release.json' not in self.assets:
                raise ValueError('La release pubblicata precede il nuovo installatore Debian')
            with self.get(self.assets['release.json']['url'], binary=True) as r:
                raw = r.read()
            expected = self.assets['release.json'].get('digest')
            if expected and expected != 'sha256:' + hashlib.sha256(raw).hexdigest():
                raise ValueError('Checksum del manifest non valido')
            self.manifest = json.loads(raw)
            if release['tag_name'] != 'v' + self.manifest['version']:
                raise ValueError('Versione del pacchetto diversa dal tag')
        m = self.manifest
        if (m['schema'] != 1 or m['platform'] != 'debian13-amd64' or not TAG.fullmatch('v' + m['version'])
                or not re.fullmatch('[a-f0-9]{40}', m['commit']) or not re.fullmatch('sha256:[a-f0-9]{64}', m['image'])
                or any(not SHA.fullmatch(m['sha256'][name]) for name in [ARCHIVE, IMAGE, MANAGER])):
            raise ValueError('Manifest della release non valido')
        self.target = ROOT / 'releases' / ('v' + m['version'])
        if self.target.is_dir():
            installed = json.loads((self.target / 'release.json').read_text())
            if installed['commit'] != m['commit']:
                raise ValueError('Lo stesso tag identifica due commit diversi')
            if installed != m:
                # A locally qualified kit and GitHub's build can share a commit but differ in bytes.
                fingerprint = hashlib.sha256(json.dumps(m, sort_keys=True).encode()).hexdigest()
                self.target = self.target.with_name(self.target.name + '-' + fingerprint)

    def get(self, url, binary=False):
        headers = dict(self.headers)
        if binary:
            headers['Accept'] = 'application/octet-stream'
        return self.opener.open(urllib.request.Request(url, headers=headers), timeout=120)

    def asset(self, name, dest):
        if self.directory:
            file = self.directory / name
        else:
            file = dest / name
            with self.get(self.assets[name]['url'], binary=True) as r, file.open('wb') as f:
                shutil.copyfileobj(r, f)
        if digest(file) != self.manifest['sha256'][name]:
            raise ValueError('Checksum non valido per ' + name)
        return file


def current(slot='current'):
    path = ROOT / slot
    if not path.is_symlink():
        return None
    target = path.resolve(strict=True)
    if target.parent != ROOT / 'releases' or not SLOT.fullmatch(target.name):
        raise ValueError('Destinazione di installazione non valida')
    return target


def prepare_host():
    owner = ROOT / '.managed'
    if not owner.is_file():
        occupied = [p for p in (ROOT, HOME, UNIT / SERVICE, Path('/etc/agent-office-palace.env'), TOOL, UNIT / TIMER,
                                UNIT / (APP + '-update.service')) if p.exists() or p.is_symlink()]
        try:
            pwd.getpwnam(USER)
            occupied.append(USER)
        except KeyError:
            pass
        if occupied:
            raise ValueError('Installazione esistente da preservare: ' + ', '.join(map(str, occupied)))
        ROOT.mkdir(mode=0o755)
        atomic(owner, '1\n')
    (ROOT / 'releases').mkdir(exist_ok=True)
    # Also repair the two program directories if a previous install stopped before activation.
    ROOT.chmod(0o755)
    (ROOT / 'releases').chmod(0o755)
    ETC.mkdir(mode=0o700, exist_ok=True)
    # Debian may start newly installed daemons. Only mask units belonging to packages
    # which have never been installed on this guest. Existing Docker workloads are independent.
    for package, units in [('docker.io', ['docker.service', 'docker.socket']), ('containerd', ['containerd.service'])]:
        status = subprocess.run(['dpkg-query', '-W', '-f=${db:Status-Status}', package], capture_output=True, text=True)
        if status.stdout not in ('installed', 'config-files'):
            for unit in units:
                if output('systemctl', 'show', '-p', 'LoadState', '--value', unit) == 'not-found':
                    run('systemctl', 'mask', unit)
    run('apt-get', 'update', '-q')
    run('apt-get', 'install', '-y', '--no-remove', '--no-install-recommends', 'ca-certificates', 'git', 'openssh-client',
        'docker.io', 'docker-cli', 'uidmap', 'rootlesskit', 'slirp4netns', 'dbus-user-session', 'fuse-overlayfs',
        env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'})
    try:
        account = pwd.getpwnam(USER)
    except KeyError:
        run('useradd', '--create-home', '--user-group', '--home-dir', HOME, '--shell', '/usr/sbin/nologin', USER)
        account = pwd.getpwnam(USER)
    if account.pw_dir != str(HOME):
        raise ValueError('Home di servizio inattesa')
    for table in ['subuid', 'subgid']:
        rows = [x.split(':') for x in (Path('/etc') / table).read_text().splitlines()]
        if not any(k in (USER, str(account.pw_uid)) and int(count) >= 65536 for k, _, count in rows):
            raise ValueError(f'Assegnare almeno 65536 ID subordinati ad {USER} in /etc/{table}')
    # The system user unit is root-owned; the daemon, its socket and its images belong to the service user.
    user_units = Path('/etc/systemd/user')
    user_units.mkdir(exist_ok=True)
    atomic(user_units / 'aop-docker.service', """[Unit]
Description=Agent Office Palace rootless Docker
[Service]
Environment=PATH=/usr/share/docker.io/contrib:/usr/local/bin:/usr/bin:/bin:/usr/sbin
ExecStart=/usr/share/docker.io/contrib/dockerd-rootless.sh --host=unix://%t/aop-docker.sock --log-opt max-size=5m --log-opt max-file=2
Restart=on-failure
RestartSec=3
Delegate=yes
[Install]
WantedBy=default.target
""")
    run('loginctl', 'enable-linger', USER)
    run('systemctl', 'start', f'user@{account.pw_uid}.service')
    userctl = ['runuser', '-u', USER, '--', 'env', f'XDG_RUNTIME_DIR=/run/user/{account.pw_uid}', 'systemctl', '--user']
    run(*userctl, 'daemon-reload')
    run(*userctl, 'enable', '--now', 'aop-docker.service')
    for i in range(30):
        probe = subprocess.run([*docker(), 'info', '--format', '{{json .SecurityOptions}}'], capture_output=True, text=True)
        if probe.returncode == 0 and 'name=rootless' in (json.loads(probe.stdout or 'null') or []):
            break
        time.sleep(1)
    else:
        raise ValueError('Il motore Docker rootless non è pronto')
    config = Path('/etc/agent-office-palace.env')
    if not config.exists():
        atomic(config, f'AGENT_OFFICE_PASSWORD={secrets.token_urlsafe(24)}\nAGENT_OFFICE_HTTPS_PORT=4643\n'
               f'AGENT_OFFICE_CODEX_RUNTIME={HOME}/codex-runtime\nAGENT_OFFICE_DOCKER_SOCKET=/run/user/{account.pw_uid}/aop-docker.sock\n'
               'AGENT_OFFICE_MANAGED_PROVIDERS=codex\n', 0o600)
    atomic(UNIT / SERVICE, f"""[Unit]
Description=Agent Office Palace
After=network.target user@{account.pw_uid}.service
Wants=user@{account.pw_uid}.service
[Service]
User={USER}
Group={USER}
WorkingDirectory={ROOT}/current
Environment=HOME={HOME}
Environment=PATH={ROOT}/current/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile={ROOT}/current/release.env
EnvironmentFile={config}
ExecStart={ROOT}/current/bin/node {ROOT}/current/bin/agent-office.js --home {HOME}/office --projects {HOME}/projects --host 0.0.0.0 --port 4600 --no-open
Restart=on-failure
RestartSec=3
UMask=0077
[Install]
WantedBy=multi-user.target
""")
    atomic(UNIT / (APP + '-update.service'), f"""[Unit]
Description=Aggiorna Agent Office Palace dalla release stabile
Wants=network-online.target
After=network-online.target
ConditionPathExists=!{ETC}/paused
[Service]
Type=oneshot
ExecStart={TOOL} update --scheduled
TimeoutStartSec=30min
""")
    atomic(UNIT / TIMER, f"""[Unit]
Description=Controlla le release di Agent Office Palace
[Timer]
OnBootSec=10min
OnUnitInactiveSec=1h
RandomizedDelaySec=5min
[Install]
WantedBy=timers.target
""")
    run('systemctl', 'daemon-reload')


def docker():
    uid = pwd.getpwnam(USER).pw_uid
    return ['runuser', '-u', USER, '--', 'docker', '--host', f'unix:///run/user/{uid}/aop-docker.sock']


def stage(release):
    target = release.target
    if target.exists():
        if json.loads((target / 'release.json').read_text()) != release.manifest:
            raise ValueError('Tag già installato con contenuto diverso')
        return
    with tempfile.TemporaryDirectory(dir=ROOT / 'releases') as temp:
        tmp = Path(temp)
        app = tmp / 'app'
        archive = release.asset(ARCHIVE, tmp)
        # The data filter leaves directory creation modes to umask. The service user must
        # be able to traverse this public application tree even when root uses umask 077.
        previous_mask = os.umask(0o022)
        try:
            app.mkdir(mode=0o755)
            with tarfile.open(archive) as tar:
                tar.extractall(app, filter='data')
        finally:
            os.umask(previous_mask)
        if digest(app / 'distribution' / MANAGER) != release.manifest['sha256'][MANAGER]:
            raise ValueError('Gestore aggiornamenti diverso dal manifest')
        # Check native modules on the target OS before switching the running application.
        tmp.chmod(0o711)
        run('runuser', '-u', USER, '--', app / 'bin/node', '-e', "require('@lydell/node-pty')", cwd=app)
        (app / 'distribution' / MANAGER).chmod(0o755)
        image = release.manifest['image']
        if subprocess.run([*docker(), 'image', 'inspect', image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            with release.asset(IMAGE, tmp).open('rb') as stream:
                run(*docker(), 'load', stdin=stream)
            run(*docker(), 'image', 'inspect', '--format', '{{.Id}}', image)
        atomic(app / 'release.env', f'AGENT_OFFICE_CODEX_IMAGE={image}\nAGENT_OFFICE_CODEX_SECCOMP={target}/distribution/codex-seccomp.json\n')
        atomic(app / 'release.json', json.dumps(release.manifest) + '\n')
        app.chmod(0o755)
        os.rename(app, target)


def healthy():
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen('http://127.0.0.1:4600/api/health', timeout=2) as r:
                pid = output('systemctl', 'show', '-p', 'MainPID', '--value', SERVICE)
                if (json.load(r).get('ok') is True and pid.isdigit() and int(pid) > 1
                        and (Path('/proc') / pid / 'cwd').resolve() == current()
                        and output('systemctl', 'is-active', SERVICE) == 'active'):
                    return True
        except (ValueError, OSError, subprocess.CalledProcessError):
            pass
        time.sleep(0.5)
    return False


def start(target):
    link(ROOT / 'current', target)
    if subprocess.run(['systemctl', 'is-failed', '--quiet', SERVICE]).returncode == 0:
        run('systemctl', 'reset-failed', SERVICE)
    run('systemctl', 'restart', SERVICE)
    if not healthy():
        raise RuntimeError('Servizio non pronto dopo 30 secondi')


def activate(target):
    old = current()
    if old == target:
        if not healthy():
            start(target)
        return
    # A persistent journal makes an interrupted switch recoverable by the next invocation.
    atomic(ROOT / 'pending', old.name if old else '-')
    try:
        start(target)
    except Exception:
        recover()
        raise
    if old:
        link(ROOT / 'previous', old)
    (ROOT / 'pending').unlink()


def recover():
    pending = ROOT / 'pending'
    if not pending.exists():
        return
    name = pending.read_text()
    if name == '-':
        run('systemctl', 'stop', SERVICE)
        (ROOT / 'current').unlink(missing_ok=True)
    else:
        if not SLOT.fullmatch(name):
            raise ValueError('Journal di aggiornamento non valido')
        start(ROOT / 'releases' / name)
        print('Ripristinata ' + name)
    pending.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'update', 'status', 'pause', 'resume', 'rollback'], nargs='?', default='install')
    parser.add_argument('--scheduled', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--from-dir', type=Path, help='Cartella di consegna con release.json e archivi')
    a = parser.parse_args()
    distro = Path('/etc/os-release').read_text()
    if (os.geteuid() or os.uname().machine != 'x86_64' or not re.search('^ID="?debian"?$', distro, re.M)
            or not re.search('^VERSION_ID="?13"?$', distro, re.M) or not Path('/run/systemd/system').is_dir()):
        parser.error('Eseguire come root in una VM Debian 13 amd64 con systemd')
    with open('/run/lock/agent-office-release.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if a.action != 'install' and not (ROOT / '.managed').is_file():
            parser.error('Nessuna installazione gestita')
        if (ROOT / '.managed').is_file():
            recover()
        if a.action == 'status':
            for slot in ('current', 'previous'):
                target = current(slot)
                if target:
                    m = json.loads((target / 'release.json').read_text())
                    print(f"{slot}: v{m['version']} ({m['commit']})")
            print('Aggiornamenti:', 'in pausa' if (ETC / 'paused').exists() else 'automatici')
        elif a.action == 'pause':
            atomic(ETC / 'paused', '1\n')
        elif a.action == 'resume':
            (ETC / 'paused').unlink(missing_ok=True)
        elif a.action == 'rollback':
            prev = current('previous')
            if not prev:
                parser.error('Nessuna release precedente')
            atomic(ETC / 'paused', '1\n')
            activate(prev)
        else:
            if a.action == 'update' and (ETC / 'paused').exists():
                print('Aggiornamenti in pausa')
                return
            release = Release(a.from_dir)
            rejected = ETC / 'failed-update'
            if a.scheduled and rejected.is_file() and rejected.read_text() == release.manifest['commit']:
                print('Questa versione è già stata ripristinata. Per riprovarla usare agent-office-release update.')
                return
            active = current() if (ROOT / '.managed').is_file() else None
            if active and tuple(map(int, active.name.split('-')[0][1:].split('.'))) > tuple(map(int, release.manifest['version'].split('.'))):
                raise ValueError('Versione precedente a quella attiva. Usare rollback per tornare indietro.')
            if a.action == 'install':
                prepare_host()
            stage(release)
            try:
                activate(release.target)
            except Exception:
                if active:
                    atomic(rejected, release.manifest['commit'])
                raise
            rejected.unlink(missing_ok=True)
            if a.action == 'install':
                link(TOOL, ROOT / 'current/distribution' / MANAGER)
                run('systemctl', 'enable', SERVICE)
                run('systemctl', 'enable', '--now', TIMER)
            print('Versione attiva:', 'v' + release.manifest['version'], release.manifest['commit'])
            if a.action == 'install':
                print('Apri https://<IP-della-VM>:4643. La password è in /etc/agent-office-palace.env (solo root).')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, RuntimeError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit('Agent Office Palace: ' + str(exc))
