"""Create a fresh Agent Office Palace VM from an official Debian cloud disk."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid


DEBIAN_BUILD = '20261116-2664'
DEBIAN_IMAGE = f'debian-13-genericcloud-amd64-{DEBIAN_BUILD}.qcow2'
DEBIAN_URL = f'https://cloud.debian.org/images/cloud/trixie/{DEBIAN_BUILD}/{DEBIAN_IMAGE}'
DEBIAN_SHA512 = ('37cb32b320820417eb04b335afcf489bfb4cecce4a957190d09cb2bffbe02b56'
                 'a1cadd62d78c6ead92aa7839d5ea65e4260f994bbb4b54490df59fdf11ee1d97')
RELEASES = 'https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases/download'
DISK_GIB = 30

# cloud-init runs this once on the guest. Record progress even if the caller on the node disconnects.
GUEST_SETUP = r'''#!/bin/bash
set -Eeuo pipefail
umask 077
state=/var/lib/agent-office-provision
mkdir -p "$state"
progress() { printf '%s\n' "$*" > "$state/status.tmp"; mv "$state/status.tmp" "$state/status"; }
phase=debian
trap 'progress "ERRORE $phase (riga $LINENO)"' ERR
progress "$phase"
source /etc/os-release
[[ $ID == debian && $VERSION_ID == 13 && ! -e /etc/pve/local ]]
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=3 update -q
apt-get -o Acquire::Retries=3 install -y --no-install-recommends qemu-guest-agent ca-certificates curl
systemctl enable --now qemu-guest-agent
phase=download
progress "$phase"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cd "$work"
download() { curl -fLsS --retry 3 --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 900 "$1" -o "$2"; }
download '@BASE@/release.json' release.json
printf '%s  release.json\n' '@HASH@' | sha256sum -c -
for name in agent-office-release.py agent-office-linux-amd64.tgz codex-agent-linux-amd64.tgz; do
    download "@BASE@/$name" "$name"
    digest=$(python3 -c 'import json,sys; print(json.load(open("release.json"))["sha256"][sys.argv[1]])' "$name")
    printf '%s  %s\n' "$digest" "$name" | sha256sum -c -
done
phase=installazione
progress "$phase"
python3 ./agent-office-release.py install --from-dir "$work"
@PAUSE@
phase=https
progress "$phase"
ip=$(cat /etc/agent-office-proxy/address)
curl -fSs --noproxy '*' --cacert /etc/agent-office-proxy/ca.crt "https://$ip/api/health" |
    python3 -c 'import sys,json; sys.exit(json.load(sys.stdin).get("ok") is not True)'
progress PRONTA
'''


def run(*cmd, **kwargs):
    return subprocess.run(cmd, check=True, text=True, **kwargs)


def api(endpoint, *args):
    return json.loads(run('pvesh', 'get', endpoint, *args, '--output-format', 'json', stdout=subprocess.PIPE).stdout)


def download(url, target):
    run('curl', '-fLsS', '--retry', '3', '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '20', '--max-time', '900', '-o', str(target), url)


def verify(path, algorithm, expected):
    with path.open('rb') as stream:
        if hashlib.file_digest(stream, algorithm).hexdigest() != expected:
            raise ValueError('Checksum errato: ' + path.name)


def choose(tty, prompt, default):
    print(f'{prompt} [{default}]: ', end='', flush=True)
    answer = tty.readline()
    if not answer:
        raise ValueError('Ingresso interrotto')
    return answer.strip() or default


def selection(args, node):
    prefix = f'/nodes/{node}'
    storage_rows = api(prefix + '/storage', '--content', 'images', '--enabled', '1')
    stores = {s['storage']: s['avail'] for s in storage_rows if s['active']}
    bridges = sorted(n['iface'] for n in api(prefix + '/network')
                     if n.get('type') in ('bridge', 'OVSBridge') and n.get('active'))
    if not stores or not bridges:
        raise ValueError('Servono uno storage attivo per immagini e un bridge attivo')
    free_id = str(api('/cluster/nextid'))
    vmid = args.vmid or free_id
    storage = args.storage or next((s for s in ('CT_drive_2', 'local-lvm') if s in stores), sorted(stores)[0])
    bridge = args.bridge or ('vmbr0' if 'vmbr0' in bridges else bridges[0])
    name = args.name
    if not args.yes:
        with open('/dev/tty', encoding='utf-8') as tty:
            vmid = choose(tty, 'ID VM', vmid)
            name = choose(tty, 'Nome VM', name)
            storage = choose(tty, 'Storage disponibile: ' + ', '.join(sorted(stores)), storage)
            bridge = choose(tty, 'Bridge disponibile: ' + ', '.join(bridges), bridge)
    if not re.fullmatch(r'[1-9]\d{2,8}', vmid) or not re.fullmatch(r'[a-z]([a-z0-9-]{0,61}[a-z0-9])?', name):
        raise ValueError('Controllare ID VM e nome host (minuscolo, massimo 63 caratteri)')
    api('/cluster/nextid', '--vmid', vmid)
    if storage not in stores or stores[storage] < (DISK_GIB + 1) * 2**30 or bridge not in bridges:
        raise ValueError('Servono un bridge elencato e almeno 31 GiB disponibili nello storage scelto')
    if any(r.get('name') == name for r in api('/cluster/resources', '--type', 'vm')):
        raise ValueError('Nome VM già in uso nel cluster. Scegliere un nome distinto.')
    print(f'VM {vmid} · {name} · 4 vCPU · 16 GiB RAM · {DISK_GIB} GiB su {storage} · DHCP su {bridge}')
    if not args.yes:
        with open('/dev/tty', encoding='utf-8') as tty:
            if choose(tty, 'Creare la VM? (s/N)', 'N').lower() not in ('s', 'si', 'sì'):
                return None
    return vmid, name, storage, bridge


def guest(vmid, *cmd):
    response = subprocess.run(['qm', 'guest', 'exec', vmid, '--timeout', '10', '--', *cmd],
                              text=True, capture_output=True, timeout=25)
    if response.returncode:
        return ''
    result = json.loads(response.stdout)
    return result.get('out-data', '').strip() if result.get('exitcode') == 0 else ''


def wait_ready(vmid):
    deadline = time.monotonic() + 30 * 60
    previous = ''
    while time.monotonic() < deadline:
        try:
            status = guest(vmid, 'cat', '/var/lib/agent-office-provision/status')
        except subprocess.TimeoutExpired:
            status = ''
        if status and status != previous:
            print('Guest:', status)
            previous = status
        if status.startswith('ERRORE'):
            raise RuntimeError(status)
        if status == 'PRONTA':
            return ipaddress.IPv4Address(guest(vmid, 'cat', '/etc/agent-office-proxy/address'))
        time.sleep(8)
    raise RuntimeError('Tempo scaduto in attesa del guest. Verificare DHCP, DNS e accesso ai repository.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag')
    parser.add_argument('manifest_hash')
    parser.add_argument('--vmid')
    parser.add_argument('--name', default='agent-office-palace')
    parser.add_argument('--storage')
    parser.add_argument('--bridge')
    parser.add_argument('--yes', action='store_true', help='usa i parametri indicati senza domande')
    args = parser.parse_args()
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?', args.tag) or not re.fullmatch(r'[a-f0-9]{64}', args.manifest_hash):
        parser.error('Riferimento release non valido')
    if os.geteuid() or platform.machine() != 'x86_64' or not Path('/etc/pve/local/qemu-server').is_dir():
        parser.error('Eseguire come root sul nodo Proxmox VE amd64')
    for tool in ('qm', 'pvesh', 'curl', 'genisoimage'):
        if not shutil.which(tool):
            parser.error('Comando mancante sul nodo: ' + tool)
    base = f'{RELEASES}/{args.tag}'
    node = Path('/etc/pve/local').resolve(strict=True).name
    with tempfile.TemporaryDirectory(prefix='aop-proxmox-', dir='/var/tmp') as temp:
        work = Path(temp)
        manifest = work / 'release.json'
        download(base + '/release.json', manifest)
        verify(manifest, 'sha256', args.manifest_hash)
        settings = selection(args, node)
        if settings is None:
            print('Operazione annullata.')
            return
        vmid, name, storage, bridge = settings
        print('Scaricamento e verifica di Debian 13…')
        disk = work / 'debian.qcow2'
        download(DEBIAN_URL, disk)
        verify(disk, 'sha512', DEBIAN_SHA512)
        seed = work / 'seed'
        seed.mkdir()
        (seed / 'meta-data').write_text(f'instance-id: {uuid.uuid4()}\nlocal-hostname: {name}\n')
        pause = 'agent-office-release pause' if '-rc.' in args.tag else ''
        (seed / 'user-data').write_text(GUEST_SETUP.replace('@BASE@', base).replace('@HASH@', args.manifest_hash)
                                        .replace('@PAUSE@', pause))
        iso = work / 'seed.raw'
        run('genisoimage', '-quiet', '-R', '-J', '-V', 'CIDATA', '-o', str(iso), str(seed))
        # qm create reserves the ID cluster-wide; never reconfigure or destroy an existing VM.
        run('qm', 'create', vmid, '--name', name, '--ostype', 'l26', '--cores', '4', '--memory', '16384',
            '--scsihw', 'virtio-scsi-pci', '--scsi0', f'{storage}:0,import-from={disk}',
            '--scsi1', f'{storage}:0,import-from={iso}', '--boot', 'order=scsi0',
            '--net0', f'virtio,bridge={bridge}', '--serial0', 'socket', '--agent', '1', '--onboot', '1')
        print(f'Creata VM {vmid}.')
        try:
            run('qm', 'disk', 'resize', vmid, 'scsi0', f'{DISK_GIB}G')
            run('qm', 'start', vmid)
            print('Avvio Debian e installazione in corso…')
            ip = wait_ready(vmid)
        except BaseException:
            print(f'VM {vmid} conservata. Console: qm terminal {vmid}. '
                  'Log nel guest: /var/log/cloud-init-output.log', file=sys.stderr)
            raise
    print(f'VM {vmid} pronta: https://{ip}/')
    print(f'Forgejo privato: https://{ip}:8443/ (utente forgejo-admin)')
    print(f'Password Forgejo dal nodo: qm guest exec {vmid} -- cat /etc/agent-office-release/forgejo/admin-password')
    print(f'Password applicativa dal nodo: qm guest exec {vmid} -- grep ^AGENT_OFFICE_PASSWORD= /etc/agent-office-palace.env')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as exc:
        sys.exit(f'Agent Office Palace: {exc}')
