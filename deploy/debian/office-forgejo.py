#!/usr/bin/python3
"""Bootstrap the private Forgejo belonging to a fresh, managed Office installation."""
import argparse
import base64
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

PROGRAM = Path('/opt/agent-office-palace/current')
STATE = Path('/etc/agent-office-release/forgejo')
HOME = Path('/var/lib/forgejo')
CONFIG = Path('/etc/forgejo/app.ini')
UNIT = Path('/etc/systemd/system/forgejo.service')
DROP = Path('/etc/systemd/system/agent-office-palace.service.d/65-floor-forgejo.conf')
ADMIN = 'forgejo-admin'
OWNER = 'office-piani'
ORG = 'uffici'
LOCAL = 'http://127.0.0.1:3000/api/v1'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def save(path, text, mode=0o600):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        os.fchmod(f.fileno(), mode)
        f.write(text.encode())
    os.replace(f.name, path)


def api(method, path, user, password, data=None, optional=False):
    auth = base64.b64encode((user + ':' + password).encode()).decode()
    request = urllib.request.Request(LOCAL + path, data=json.dumps(data).encode() if data is not None else None,
                                     headers={'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth},
                                     method=method)
    try:
        with OPENER.open(request, timeout=15) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        if optional and error.code == 404:
            return None
        raise RuntimeError(f'Forgejo {method} {path}: HTTP {error.code}') from None


def prepare(ip):
    if not STATE.exists():
        paths = [CONFIG.parent, HOME, UNIT, Path('/usr/local/bin/forgejo')]
        try:
            pwd.getpwnam('forgejo')
        except KeyError:
            pass
        else:
            raise ValueError('Utente forgejo preesistente')
        if any(path.exists() for path in paths) or subprocess.check_output(
                ['systemctl', 'show', '-p', 'LoadState', '--value', 'forgejo'], text=True).strip() != 'not-found':
            raise ValueError('Installazione Forgejo preesistente da preservare')
        STATE.mkdir(mode=0o700)
    try:
        account = pwd.getpwnam('forgejo')
    except KeyError:
        subprocess.run(['useradd', '--system', '--user-group', '--create-home', '--home-dir', HOME,
                        '--shell', '/usr/sbin/nologin', 'forgejo'], check=True)
        account = pwd.getpwnam('forgejo')
    if account.pw_dir != str(HOME):
        raise ValueError('Home Forgejo inattesa')
    CONFIG.parent.mkdir(mode=0o750, exist_ok=True)
    os.chown(CONFIG.parent, 0, account.pw_gid)
    CONFIG.parent.chmod(0o750)  # cloud-init deliberately runs with umask 077
    binary = PROGRAM / 'distribution/forgejo'
    if not CONFIG.exists():
        def secret(kind):
            return subprocess.check_output(['runuser', '-u', 'forgejo', '--', binary, 'generate', 'secret', kind],
                                           text=True, cwd=HOME).strip()
        save(CONFIG, f"""APP_NAME = Agent Office Palace
RUN_USER = forgejo
RUN_MODE = prod
WORK_PATH = {HOME}
[database]
DB_TYPE = sqlite3
PATH = {HOME}/data/forgejo.db
[server]
PROTOCOL = http
HTTP_ADDR = 127.0.0.1
HTTP_PORT = 3000
DOMAIN = {ip}
ROOT_URL = https://{ip}:8443/
LOCAL_ROOT_URL = http://127.0.0.1:3000/
DISABLE_SSH = true
OFFLINE_MODE = true
[security]
INSTALL_LOCK = true
SECRET_KEY = {secrets.token_hex(32)}
INTERNAL_TOKEN = {secret('INTERNAL_TOKEN')}
[oauth2]
JWT_SECRET = {secret('JWT_SECRET')}
[service]
DISABLE_REGISTRATION = true
REQUIRE_SIGNIN_VIEW = true
[repository]
DEFAULT_PRIVATE = private
[actions]
ENABLED = false
""", 0o640)
    os.chown(CONFIG, 0, account.pw_gid)
    save(UNIT, f"""[Unit]
Description=Forgejo privato di Agent Office Palace
After=network.target
[Service]
User=forgejo
Group=forgejo
WorkingDirectory={HOME}
Environment=HOME={HOME}
ExecStart={binary} --work-path {HOME} --config {CONFIG} web
UMask=0027
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths={HOME}
[Install]
WantedBy=multi-user.target
""", 0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now', 'forgejo'], check=True)
    for _ in range(90):
        try:
            with OPENER.open('http://127.0.0.1:3000/api/healthz', timeout=2) as r:
                if json.load(r).get('status') == 'pass':
                    break
        except (ValueError, OSError):
            pass
        time.sleep(1)
    else:
        raise RuntimeError('Forgejo non risponde su loopback')


def tokens(password, state, pending):
    path = f'/users/{OWNER}/tokens'
    for key, scopes in [('reader', ['read:user', 'read:repository', 'read:issue']),
                        ('manager', ['read:user', 'write:organization', 'write:repository'])]:
        if key in state:
            continue
        name = 'agent-office-' + key
        # A crash may occur between token issuance and the atomic local write.
        for token in api('GET', path, OWNER, password):
            if token['name'] == name:
                api('DELETE', path + '/' + str(token['id']), OWNER, password)
        token = api('POST', path, OWNER, password, {'name': name, 'scopes': scopes})
        state[key] = token['sha1']
        save(pending, json.dumps(state))


def connect(ip):
    pending = STATE / 'setup.json'
    if (STATE / 'ready').exists():
        pending.unlink(missing_ok=True)
        return
    bootstrap = STATE / 'admin-password'
    if not bootstrap.exists():
        args = ['runuser', '-u', 'forgejo', '--', PROGRAM / 'distribution/forgejo', '--work-path', HOME,
                '--config', CONFIG, 'admin', 'user', 'create', '--username', ADMIN,
                '--email', ADMIN + '@office.invalid', '--admin', '--random-password',
                '--random-password-length', '40', '--must-change-password=false']
        # The CLI prints its generated password. Direct its complete output to a root-only
        # journal first so even an interrupted installation can recover that password.
        journal = STATE / 'create-admin'
        if not journal.exists() or not re.search(r"(?m)^generated random password is '(.+)'$", journal.read_text()):
            with journal.open('w') as stream:
                subprocess.run(args, stdout=stream, check=True)
        match = re.search(r"(?m)^generated random password is '(.+)'$", journal.read_text())
        if not match:
            raise RuntimeError('Password iniziale Forgejo non disponibile')
        save(bootstrap, match[1] + '\n')
    (STATE / 'create-admin').unlink(missing_ok=True)
    admin_password = bootstrap.read_text().rstrip('\n')
    if not pending.exists():
        save(pending, json.dumps({'password': secrets.token_urlsafe(40)}))
    state = json.loads(pending.read_text())
    password = state['password']
    if api('GET', '/users/' + OWNER, ADMIN, admin_password, optional=True) is None:
        api('POST', '/admin/users', ADMIN, admin_password, {'username': OWNER, 'email': OWNER + '@office.invalid',
            'password': password, 'must_change_password': False, 'send_notify': False})
    if api('GET', '/user', OWNER, password).get('is_admin') is not False:
        raise RuntimeError('Il proprietario dei repository deve essere un utente ordinario')
    if api('GET', '/orgs/' + ORG, OWNER, password, optional=True) is None:
        api('POST', '/orgs', OWNER, password, {'username': ORG, 'visibility': 'private'})
    tokens(password, state, pending)
    url = f'https://{ip}:8443'
    ca = Path('/usr/local/share/ca-certificates/agent-office-local.crt')
    save(ca, Path('/etc/agent-office-proxy/ca.crt').read_text(), 0o644)
    subprocess.run(['update-ca-certificates'], check=True)
    # Use the application's own store format and its live token verification.
    result = subprocess.run(['runuser', '-u', 'agentoffice', '--', 'env', 'NODE_EXTRA_CA_CERTS=' + str(ca),
                             PROGRAM / 'bin/node', PROGRAM / 'distribution/register-reader.mjs'],
                            input=json.dumps({'url': url, 'username': OWNER, 'token': state['reader']}),
                            text=True, stdout=subprocess.PIPE, check=True)
    reader = result.stdout.strip()
    if not re.fullmatch('[a-z0-9_-]{1,64}', reader):
        raise ValueError('Identità tecnica di lettura non verificata')
    save(STATE / 'floor.json', json.dumps({'url': url, 'organization': ORG, 'token': state['manager'],
                                           'readerAccountId': reader}))
    DROP.parent.mkdir(exist_ok=True)
    save(DROP, f'[Service]\nLoadCredential=floor-forgejo:{STATE}/floor.json\n'
               f'Environment=AGENT_OFFICE_FLOOR_FORGEJO=%d/floor-forgejo\n'
               f'Environment=AGENT_OFFICE_FLOOR_READER={reader}\nEnvironment=NODE_EXTRA_CA_CERTS={ca}\n', 0o644)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'restart', 'agent-office-palace'], check=True)
    save(STATE / 'ready', '1\n')
    pending.unlink()


if __name__ == '__main__':
    import ipaddress
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'connect'])
    parser.add_argument('ip', type=ipaddress.IPv4Address)
    args = parser.parse_args()
    (prepare if args.action == 'prepare' else connect)(str(args.ip))
