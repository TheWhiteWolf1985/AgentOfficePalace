"""Local systemd bridge for administrator-approved Office releases."""
import fcntl
import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.request

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('agent-office-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
ETC = release.ETC
UNIT = release.UNIT
PREFIX = 'agent-office-updates'
SOCKET = '/run/agent-office-updates.sock'
WORK = PREFIX + '-apply.service'
API = 'https://api.github.com/repos/' + release.REPO + '/releases'
ACTIVE = {'waiting', 'preparing', 'activating'}
CHANNELS = {'stable', 'preview'}


def read(name, default):
    path = ETC / name
    return json.loads(path.read_text()) if path.exists() else default


def save(name, value):
    release.atomic(ETC / name, json.dumps(value), 0o600)


def install():
    # Older GUI updaters run this candidate-side hook before activating the new Office.
    if (ETC / 'forgejo/ready').is_file():
        release.run(sys.executable, '-I', Path(__file__).with_name('office-forgejo.py'), 'agent-admin', '127.0.0.1')
    release.run(sys.executable, '-I', Path(__file__).with_name('office-tunnel.py'))
    secret = ETC / 'activity.env'
    if not secret.exists():
        release.atomic(secret, 'AOP_RELEASE_PROBE=' + secrets.token_hex(32) + '\n', 0o600)
    drop = UNIT / (release.SERVICE + '.d')
    drop.mkdir(exist_ok=True)
    release.atomic(drop / 'update-probe.conf', '[Service]\nEnvironmentFile=' + str(secret) + '\n')
    # Install from the candidate even when an older GUI is driving the upgrade.
    scratch = Path(__file__).resolve().with_name('git-scratch.py')
    release.atomic(UNIT / 'agent-office-git.socket', f"""[Socket]
ListenStream=/run/agent-office-git.sock
Accept=yes
SocketMode=0660
SocketGroup={release.USER}
TriggerLimitIntervalSec=0
[Install]
WantedBy=sockets.target
""")
    release.atomic(UNIT / 'agent-office-git@.service', f"""[Service]
ExecStart=/usr/bin/python3 -I {scratch}
StandardInput=socket
StandardOutput=socket
StandardError=journal
UMask=0022
RuntimeMaxSec=60
""")
    helper = str(release.ROOT / 'current/distribution/office-updates.py')
    release.atomic(UNIT / (PREFIX + '.socket'), f"""[Socket]
ListenStream={SOCKET}
Accept=yes
SocketMode=0660
SocketGroup={release.USER}
MaxConnections=12
TriggerLimitIntervalSec=0
[Install]
WantedBy=sockets.target
""")
    release.atomic(UNIT / (PREFIX + '@.service'), f"""[Service]
ExecStart=/usr/bin/python3 -I {helper} request
StandardInput=socket
StandardOutput=socket
StandardError=journal
TimeoutStartSec=40
RuntimeMaxSec=45
NoNewPrivileges=yes
""")
    release.atomic(UNIT / WORK, f"""[Unit]
Description=Aggiornamento approvato da Agent Office Palace
After=network-online.target {release.SERVICE}
ConditionPathExists={ETC}/gui-job.json
[Service]
Type=simple
ExecStart=/usr/bin/python3 -I {helper} apply
[Install]
WantedBy=multi-user.target
""")
    # Existing stable timers must not advance an installation without the administrator's click.
    if not (ETC / 'gui-installed').exists():
        release.atomic(ETC / 'paused', '1\n')
    release.run('systemctl', 'daemon-reload')
    release.run('systemctl', 'enable', '--now', 'agent-office-git.socket')
    release.run('systemctl', 'enable', '--now', PREFIX + '.socket')
    release.run('systemctl', 'enable', WORK)
    release.atomic(ETC / 'gui-installed', '1\n')


def version(tag):
    main, _, rc = tag[1:].partition('-rc.')
    return (*map(int, main.split('.')), not bool(rc), int(rc or 0))


def newest(rows, channel):
    eligible = []
    for r in rows:
        tag = r['tag_name']
        if (r['draft'] or not release.PUBLIC_TAG.fullmatch(tag)
                or r['prerelease'] != ('-rc.' in tag) or (channel == 'stable' and r['prerelease'])
                or not {release.ARCHIVE, release.IMAGE, 'release.json'}.issubset(a['name'] for a in r['assets'])):
            continue
        eligible.append({'tag': tag, 'notes': (r.get('body') or '')[:1500]})
    return max(eligible, key=lambda r: version(r['tag']), default=None)


def catalog(channel, force=False):
    previous = read('gui-catalog-' + channel + '.json', {})
    age = time.time() - previous.get('checked', 0)
    if age < (30 if force else 1800) and not (previous.get('error') and age >= 60):
        return previous
    try:
        # Stable has a separate endpoint even when many prereleases have been published.
        endpoint = API + ('/latest' if channel == 'stable' else '?per_page=100')
        req = urllib.request.Request(endpoint, headers={'User-Agent': 'AgentOfficePalace-updates'})
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.load(response)
        result = {'checked': int(time.time()), 'latest': newest(data if isinstance(data, list) else [data], channel)}
    except (OSError, ValueError, KeyError):
        result = {**previous, 'checked': int(time.time()), 'error': 'GitHub non raggiungibile. Riprova più tardi.'}
    save('gui-catalog-' + channel + '.json', result)
    return result


def installed():
    manifest = json.loads((release.current() / 'release.json').read_text())
    return manifest.get('tag', 'v' + manifest['version'])


def status(channel, job, listing):
    tag = installed()
    latest = listing.get('latest')
    return dict(managed=True, current=tag, channel=channel, job=job, error=listing.get('error'),
                checked=listing.get('checked'), available=latest if latest and version(latest['tag']) > version(tag) else None)


def request(body):
    action = body['action']
    if action not in ('status', 'check', 'channel', 'apply'):
        raise ValueError('Azione non valida')
    with (ETC / 'gui.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        channel = read('gui-channel.json', 'stable')
        job = read('gui-job.json', {})
        running = job.get('phase') in ACTIVE
        if action == 'channel':
            if running or body.get('channel') not in CHANNELS:
                raise ValueError('Cambio canale non disponibile')
            channel = body['channel']
            save('gui-channel.json', channel)
        listing = read('gui-catalog-' + channel + '.json', {}) if running else catalog(channel, action == 'check')
        result = status(channel, job, listing)
        if action != 'apply':
            return result
        if running:
            if job['tag'] != body.get('tag'):
                raise ValueError('È già in corso un altro aggiornamento')
            return result
        if listing.get('error') or not result['available'] or result['available']['tag'] != body.get('tag'):
            raise ValueError('La versione selezionata non è più disponibile. Controlla di nuovo.')
        job = {'tag': body['tag'], 'phase': 'waiting'}
        save('gui-job.json', job)
        try:
            release.run('systemctl', 'start', '--no-block', WORK)
        except subprocess.CalledProcessError:
            save('gui-job.json', {**job, 'phase': 'failed'})
            raise
        return {**result, 'job': job}


def wait_idle():
    secret = (ETC / 'activity.env').read_text().strip().partition('=')[2]
    req = urllib.request.Request('http://127.0.0.1:4600/api/update-activity', headers={'X-Office-Probe': secret})
    while True:
        with urllib.request.urlopen(req, timeout=8) as response:
            count = json.load(response)['busy']
        if type(count) is not int or count < 0:
            raise ValueError('Stato degli agenti non disponibile')
        if not count:
            return
        time.sleep(5)


def apply():
    job = read('gui-job.json', {})
    if job.get('phase') not in ACTIVE:
        return
    tag = job['tag']

    def phase(value):
        save('gui-job.json', {'tag': tag, 'phase': value})

    try:
        with open('/run/lock/agent-office-release.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            release.recover()
            if installed() != tag:
                if not release.PUBLIC_TAG.fullmatch(tag) or version(tag) <= version(installed()):
                    raise ValueError('Versione obsoleta')
                phase('waiting')
                wait_idle()
                phase('preparing')
                package = release.Release(None, tag)
                release.stage(package)
                release.prepare_dashboard(package.target)
                phase('waiting')
                wait_idle()
                phase('activating')
                release.activate(package.target)
            if not release.healthy() or installed() != tag:
                raise ValueError('Versione attiva inattesa')
            phase('done')
    except Exception:
        phase('failed')
        raise


if __name__ == '__main__':
    mode, = sys.argv[1:]
    if mode == 'install':
        install()
    elif mode == 'apply':
        apply()
    elif mode == 'request':
        try:
            line = sys.stdin.buffer.readline(1025)
            if len(line) > 1024:
                raise ValueError('Richiesta troppo lunga')
            print(json.dumps(request(json.loads(line))))
        except (ValueError, KeyError, TypeError) as err:
            print(json.dumps({'rejected': str(err)}))
    else:
        sys.exit(2)
