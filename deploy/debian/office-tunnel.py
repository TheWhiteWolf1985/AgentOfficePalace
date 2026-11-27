#!/usr/bin/python3
"""Provision a managed, forwarding-only SSH identity. Contains no OAuth or agent tools."""
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import subprocess
import tempfile

USER = 'office-tunnel'
SERVICE_USER = 'agentoffice'
STATE = Path('/etc/agent-office-tunnel')
CONFIG = STATE / 'sshd.conf'
MAIN = Path('/etc/ssh/sshd_config')
RUNTIME = Path('/run/sshd')
RULES = '''# Managed by Agent Office Palace: OAuth callback forwarding only.
Match User office-tunnel
    AuthenticationMethods password
    PasswordAuthentication yes
    PubkeyAuthentication no
    KbdInteractiveAuthentication no
    MaxSessions 0
    ForceCommand /usr/sbin/nologin
    PermitTTY no
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:4610
    PermitListen none
    AllowStreamLocalForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitUserRC no
    GatewayPorts no
Match all
'''
EXPECTED = {'authenticationmethods': 'password', 'passwordauthentication': 'yes', 'pubkeyauthentication': 'no',
            'kbdinteractiveauthentication': 'no', 'maxsessions': '0', 'forcecommand': '/usr/sbin/nologin',
            'permittty': 'no', 'allowtcpforwarding': 'local', 'permitopen': '127.0.0.1:4610', 'permitlisten': 'none',
            'allowstreamlocalforwarding': 'no', 'allowagentforwarding': 'no', 'x11forwarding': 'no',
            'permittunnel': 'no', 'permituserrc': 'no', 'gatewayports': 'no', 'disableforwarding': 'no'}


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def atomic(file, text, mode, group=0):
    with tempfile.NamedTemporaryFile(dir=file.parent, delete=False) as f:
        os.fchmod(f.fileno(), mode)
        os.fchown(f.fileno(), 0, group)
        f.write(text.encode())
    os.replace(f.name, file)


def validate():
    run('/usr/sbin/sshd', '-t')
    # Local and LAN clients must receive the same restrictions, including installations with custom Match rules.
    for address in ('127.0.0.1', '192.0.2.10', '2001:db8::10'):
        result = run('/usr/sbin/sshd', '-T', '-C', f'user={USER},host=office-client,addr={address}',
                     capture_output=True, text=True)
        values = dict(line.split(' ', 1) for line in result.stdout.splitlines())
        if any(values.get(k) != v for k, v in EXPECTED.items()):
            raise ValueError('La configurazione SSH esistente non applica i limiti del tunnel')


def install():
    if os.geteuid() != 0:
        raise ValueError('Sono necessari i privilegi di root')
    service = pwd.getpwnam(SERVICE_USER)
    account_file = STATE / 'account.json'
    ready = STATE / 'ready'
    managed = STATE / 'managed'
    try:
        account = pwd.getpwnam(USER)
    except KeyError:
        account = None
    # Never adopt an unrelated user or overwrite an administrator's unrelated SSH drop-in.
    owned = managed.is_file() and not managed.is_symlink() and managed.stat().st_uid == 0
    if account and not owned:
        raise ValueError('Utente office-tunnel esistente e non gestito: preservato')
    if CONFIG.exists() and CONFIG.read_text() != RULES and not owned:
        raise ValueError('Configurazione SSH del tunnel esistente e non gestita: preservata')
    STATE.mkdir(mode=0o750, exist_ok=True)
    if STATE.is_symlink() or account_file.is_symlink() or CONFIG.is_symlink() or ready.is_symlink() or managed.is_symlink():
        raise ValueError('Percorso di configurazione del tunnel non valido')
    os.chown(STATE, 0, service.pw_gid)
    STATE.chmod(0o750)
    if ready.is_file() and not account_file.is_file():
        raise ValueError('Credenziali del tunnel mancanti: nessuna password sostitutiva generata')
    data = json.loads(account_file.read_text()) if account_file.exists() else {
        'user': USER, 'password': secrets.token_urlsafe(36)}
    if data.get('user') != USER or not isinstance(data.get('password'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{48}', data['password']):
        raise ValueError('Credenziali del tunnel non valide')
    if not Path('/usr/sbin/sshd').is_file():
        run('apt-get', 'update', '-q')
        run('apt-get', 'install', '-y', '--no-remove', '--no-install-recommends', 'openssh-server',
            env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'})
    CONFIG.parent.mkdir(exist_ok=True)
    RUNTIME.mkdir(mode=0o755, exist_ok=True)
    created = account is None
    if created:
        atomic(managed, '1\n', 0o600)
        run('useradd', '--no-create-home', '--user-group', '--home-dir', '/nonexistent',
            '--shell', '/usr/sbin/nologin', USER)
        account = pwd.getpwnam(USER)
    if account.pw_uid == 0 or account.pw_dir != '/nonexistent' or account.pw_shell != '/usr/sbin/nologin':
        raise ValueError('Identità del tunnel inattesa: configurazione interrotta')
    groups = os.getgrouplist(USER, account.pw_gid)
    if set(groups) != {account.pw_gid}:
        raise ValueError('Utente del tunnel presente in gruppi aggiuntivi: configurazione interrotta')
    previous = CONFIG.read_bytes() if CONFIG.exists() else None
    original = MAIN.read_text()
    mode, group = MAIN.stat().st_mode & 0o777, MAIN.stat().st_gid
    include = 'Include ' + str(CONFIG)
    if MAIN.is_symlink():
        raise ValueError('Configurazione SSH principale simbolica: preservata')
    atomic(CONFIG, RULES, 0o644)
    # Append after global options; a Match block inside Debian's leading Include would
    # otherwise make later global-only options invalid. Preserve every existing setting.
    if include not in original.splitlines():
        atomic(MAIN, original.rstrip() + '\n\n# Agent Office Palace callback-only identity\nMatch all\n' + include + '\n', mode, group)
    try:
        validate()
    except Exception:
        if previous is None:
            CONFIG.unlink()
        else:
            atomic(CONFIG, previous.decode(), 0o644)
        atomic(MAIN, original, mode, group)
        raise
    run('systemctl', 'enable', '--now', 'ssh.service')
    run('systemctl', 'reload', 'ssh.service')
    fingerprint = run('ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub', capture_output=True, text=True).stdout.split()[1]
    data['fingerprint'] = fingerprint
    atomic(account_file, json.dumps(data) + '\n', 0o640, service.pw_gid)
    if not ready.is_file() or created:
        # Password goes over stdin, never through argv, stdout, logs or the distributable image.
        run('chpasswd', input=USER + ':' + data['password'] + '\n', text=True, capture_output=True)
        atomic(ready, '1\n', 0o600)
    print('Utente office-tunnel pronto: solo callback OAuth; credenziali nel pannello amministrativo.')


if __name__ == '__main__':
    install()
