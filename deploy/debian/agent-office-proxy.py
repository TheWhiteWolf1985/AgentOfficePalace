#!/usr/bin/python3
"""Configure the IP-based Nginx ingress of a dedicated Debian Office VM."""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request

CONFIG = Path('/etc/agent-office-proxy')
SITE = Path('/etc/nginx/sites-enabled/agent-office-palace.conf')
DEFAULT = SITE.parent / 'default'
FORGEJO = Path('/etc/forgejo/app.ini')
OFFICE = 'agent-office-palace'
DROP = Path('/etc/systemd/system/agent-office-palace.service.d/60-reverse-proxy.conf')


def run(*cmd):
    return subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE).stdout.strip()


def address(override):
    interfaces = json.loads(run('ip', '-j', '-4', 'address', 'show', 'up'))
    local = {item['local'] for interface in interfaces for item in interface['addr_info']
             if item['scope'] == 'global' and item['family'] == 'inet'}
    if override:
        selected = override
    else:
        # Kernel routing lookup only. No connection or DNS resolution takes place.
        routes = json.loads(run('ip', '-j', '-4', 'route', 'get', '192.0.2.1'))
        selected = routes[0].get('prefsrc') if routes else None
    if selected not in local:
        raise ValueError('Selezionare con --ip un IPv4 assegnato alla VM')
    return str(ipaddress.IPv4Address(selected))


def atomic(path, data, mode):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        os.fchmod(f.fileno(), mode)
        if path.exists():
            stat = path.stat()
            os.fchown(f.fileno(), stat.st_uid, stat.st_gid)
        f.write(data)
    os.replace(f.name, path)


def certificates(ip):
    ca = CONFIG / 'ca.crt'
    ca_key = CONFIG / 'ca.key'
    if ca.exists() != ca_key.exists():
        raise ValueError('Coppia CA incompleta in ' + str(CONFIG))
    if not ca.exists():
        with tempfile.TemporaryDirectory(dir=CONFIG) as tmp:
            tmp = Path(tmp)
            run('openssl', 'req', '-new', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
                '-nodes', '-days', '3650', '-subj', f'/CN=Agent Office Palace CA {ip}',
                '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
                '-keyout', tmp / 'key', '-out', tmp / 'ca')
            atomic(ca_key, (tmp / 'key').read_bytes(), 0o600)
            atomic(ca, (tmp / 'ca').read_bytes(), 0o644)
    cert = CONFIG / 'server.crt'
    key = CONFIG / 'server.key'
    if cert.exists() and key.exists():
        try:
            run('openssl', 'verify', '-CAfile', ca, '-verify_ip', ip, cert)
            run('openssl', 'x509', '-checkend', '2592000', '-in', cert, '-noout')
            if run('openssl', 'x509', '-in', cert, '-pubkey', '-noout') == run('openssl', 'pkey', '-in', key, '-pubout'):
                return
        except subprocess.CalledProcessError:
            pass
    with tempfile.TemporaryDirectory(dir=CONFIG) as tmp:
        tmp = Path(tmp)
        run('openssl', 'req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
            '-nodes', '-subj', f'/CN={ip}', '-keyout', tmp / 'key', '-out', tmp / 'request')
        (tmp / 'extensions').write_text(f'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n'
                                         f'extendedKeyUsage=serverAuth\nsubjectAltName=IP:{ip}\n')
        run('openssl', 'x509', '-req', '-in', tmp / 'request', '-CA', ca, '-CAkey', ca_key,
            '-days', '365', '-extfile', tmp / 'extensions', '-out', tmp / 'cert')
        run('openssl', 'verify', '-CAfile', ca, '-verify_ip', ip, tmp / 'cert')
        atomic(key, (tmp / 'key').read_bytes(), 0o600)
        atomic(cert, (tmp / 'cert').read_bytes(), 0o644)


def forgejo_settings(source, ip):
    section = re.search(r'(?ims)^\[server\][ \t]*\n(?P<body>.*?)(?=^\[|\Z)', source)
    if not section:
        raise ValueError('Sezione [server] assente in ' + str(FORGEJO))
    body = section['body']
    for key, value in {'PROTOCOL': 'http', 'HTTP_ADDR': '127.0.0.1', 'HTTP_PORT': '3000', 'DOMAIN': ip,
                       'ROOT_URL': f'https://{ip}:8443/', 'LOCAL_ROOT_URL': 'http://127.0.0.1:3000/'}.items():
        pattern = rf'(?im)^[ \t]*{key}[ \t]*=.*$'
        line = key + ' = ' + value
        if re.search(pattern, body):
            body = re.sub(pattern, line, body)
        else:
            body = body.rstrip() + '\n' + line + '\n\n'
    return source[:section.start('body')] + body + source[section.end('body'):]


def nginx_site(ip, forgejo):
    conf = '''# Managed by agent-office-proxy
map $http_upgrade $aop_connection { default upgrade; "" close; }
log_format aop_ip '$remote_addr [$time_local] "$request_method $uri $server_protocol" $status $body_bytes_sent';
'''
    # Browsers share cookies between ports. Remove the Office cookie and its two legacy siblings
    # before passing the remaining (including optional authentication-provider) cookies to Forgejo.
    cookie = '$http_cookie'
    if forgejo:
        for n, name in enumerate(('ao_session', 'ao_session_4600', 'ao_session_4643')):
            filtered = f'$aop_cookie_{n}'
            conf += f'''map {cookie} {filtered} {{
    default {cookie};
    "~^(?<aop_left{n}>(?:[^;]+;\\s*)*?){name}=[^;]*(?:;\\s*|$)(?<aop_right{n}>.*)$" "$aop_left{n}$aop_right{n}";
}}
'''
            cookie = filtered
    conf += f'''server {{
    listen 80 default_server;
    server_name {ip};
    access_log /var/log/nginx/access.log aop_ip;
    return 308 https://{ip}$request_uri;
}}
'''
    for port, upstream in ((443, 4600), (8443, 3000)):
        if port == 8443 and not forgejo:
            continue
        authority = ip if port == 443 else f'{ip}:{port}'
        upstream_cookie = '"ao_session=$cookie_ao_session"' if port == 443 else cookie
        conf += f'''server {{
    listen {port} ssl default_server;
    server_name {ip};
    if ($host != {ip}) {{ return 421; }}
    ssl_certificate {CONFIG}/server.crt;
    ssl_certificate_key {CONFIG}/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log /var/log/nginx/access.log aop_ip;
    location / {{
        proxy_pass http://127.0.0.1:{upstream};
        proxy_http_version 1.1;
        proxy_set_header Host {authority};
        proxy_set_header X-Forwarded-Host {authority};
        proxy_set_header X-Forwarded-Port {port};
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Forwarded "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $aop_connection;
        proxy_set_header Cookie {upstream_cookie};
        proxy_read_timeout 3600s;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 0;
    }}
}}
'''
    return conf


def office_override():
    release = Path('/opt/agent-office-palace/current')
    if (release / 'bin/agent-office.js').is_file():
        node, app = release / 'bin/node', release / 'bin/agent-office.js'
    else:
        node = Path('/opt/node22/bin/node')
        app = Path('/opt/agent-office-palace/source/bin/agent-office.js')
    if not node.is_file() or not app.is_file():
        raise ValueError('Installazione Office assente')
    return ('[Service]\nUnsetEnvironment=AGENT_OFFICE_HTTPS_PORT\nExecStart=\n'
            f'ExecStart={node} {app} --home /var/lib/agent-office-palace/office '
            '--projects /var/lib/agent-office-palace/projects --host 127.0.0.1 --port 4600 --trust-proxy --no-open\n')


def check(url, ca, forgejo=False):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(ca))))
    for attempt in range(35):
        try:
            with opener.open(url, timeout=3) as response:
                data = json.load(response)
                if (data.get('status') == 'pass' if forgejo else data.get('ok') is True):
                    return
        except (ValueError, OSError):
            pass
        time.sleep(0.5)
    raise RuntimeError('Verifica HTTPS fallita per ' + url)


def configure(ip, forgejo):
    CONFIG.mkdir(mode=0o700, exist_ok=True)
    if SITE.exists() and not SITE.read_text().startswith('# Managed by agent-office-proxy\n'):
        raise ValueError('Sito Nginx preesistente: ' + str(SITE))
    forgejo = forgejo or (CONFIG / 'forgejo-enabled').exists()
    office = office_override().encode()
    ini = forgejo_settings(FORGEJO.read_text(), ip).encode() if forgejo else None
    default_link = DEFAULT.is_symlink() and DEFAULT.resolve() == Path('/etc/nginx/sites-available/default')
    old = {}
    for path in (DROP, SITE, CONFIG / 'server.key', CONFIG / 'server.crt', *([FORGEJO] if forgejo else [])):
        old[path] = (path.read_bytes(), path.stat().st_mode & 0o777) if path.exists() else None
    office_changed = not old[DROP] or old[DROP][0] != office
    forgejo_changed = forgejo and old[FORGEJO][0] != ini
    nginx_active = subprocess.run(['systemctl', 'is-active', '--quiet', 'nginx']).returncode == 0
    restarted = []
    try:
        certificates(ip)
        atomic(SITE, nginx_site(ip, forgejo).encode(), 0o644)
        if default_link:
            DEFAULT.unlink()
        run('nginx', '-t')
        if office_changed:
            atomic(DROP, office, 0o644)
            run('systemctl', 'daemon-reload')
            restarted.append(OFFICE)
            run('systemctl', 'restart', OFFICE)
        if forgejo_changed:
            atomic(FORGEJO, ini, old[FORGEJO][1])
            restarted.append('forgejo')
            run('systemctl', 'restart', 'forgejo')
        run('systemctl', 'reload' if nginx_active else 'start', 'nginx')
        ca = CONFIG / 'ca.crt'
        check(f'https://{ip}/api/health', ca)
        if forgejo:
            check(f'https://{ip}:8443/api/healthz', ca, forgejo=True)
        run('systemctl', 'enable', 'nginx')
    except BaseException:
        for path, previous in old.items():
            if previous:
                atomic(path, *previous)
            else:
                path.unlink(missing_ok=True)
        if default_link and not DEFAULT.exists():
            DEFAULT.symlink_to('/etc/nginx/sites-available/default')
        run('systemctl', 'daemon-reload')
        for service in restarted:
            run('systemctl', 'restart', service)
        run('systemctl', 'reload' if nginx_active else 'stop', 'nginx')
        raise
    if forgejo:
        atomic(CONFIG / 'forgejo-enabled', b'1\n', 0o600)
    atomic(CONFIG / 'address', (ip + '\n').encode(), 0o644)
    print(f'Office https://{ip}/')
    if forgejo:
        print(f'Forgejo https://{ip}:8443/')
    print('Certificato CA pubblico:', ca)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ip', help='Indirizzo IPv4 locale alternativo')
    parser.add_argument('--forgejo', action='store_true', help='Pubblica il Forgejo Debian già installato')
    parser.add_argument('--yes', action='store_true', help='Accetta l’indirizzo rilevato')
    args = parser.parse_args()
    ip = address(args.ip)
    if not args.yes and sys.stdin.isatty():
        ip = address(input(f'IP LAN della VM [{ip}]: ').strip() or ip)
    if os.geteuid():
        parser.error('Richiesti privilegi root')
    with open('/run/lock/agent-office-proxy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        configure(ip, args.forgejo)


if __name__ == '__main__':
    os.umask(0o077)
    main()
