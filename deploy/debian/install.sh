#!/bin/bash
# First install, from a public GitHub release or an already downloaded delivery directory.
set -euo pipefail
source /etc/os-release
if [[ $EUID != 0 || $ID != debian || $VERSION_ID != 13 || $(dpkg --print-architecture) != amd64 || ! -d /run/systemd/system ]]; then
  echo 'Eseguire come root dentro una VM Debian 13 amd64 avviata con systemd.' >&2
  exit 2
fi
if [[ $# -gt 1 ]]; then echo "Uso: bash install.sh [cartella-consegna]" >&2; exit 2; fi
if ! command -v python3 >/dev/null || ! command -v curl >/dev/null || [[ ! -s /etc/ssl/certs/ca-certificates.crt ]]; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 curl ca-certificates
fi
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
args=()
tag='@RELEASE_TAG@'
manifest_hash='@MANIFEST_SHA256@'
if [[ $# == 1 ]]; then
  src=$(realpath "$1")
  cp "$src/release.json" "$src/agent-office-release.py" "$work/"
  args=(--from-dir "$src")
else
  repo=https://github.com/TheWhiteWolf1985/AgentOfficePalace/releases
  for file in release.json agent-office-release.py agent-office-linux-amd64.tgz codex-agent-linux-amd64.tgz; do
    curl --fail --silent --show-error --location --retry 3 --proto '=https' --proto-redir '=https' "$repo/download/$tag/$file" -o "$work/$file"
  done
  args=(--from-dir "$work")
fi
printf '%s  %s\n' "$manifest_hash" "$work/release.json" | sha256sum -c -
(cd "$work" && python3 -c 'import hashlib,json; f="agent-office-release.py"; assert hashlib.sha256(open(f,"rb").read()).hexdigest()==json.load(open("release.json"))["sha256"][f], "Checksum installatore errato"')
python3 "$work/agent-office-release.py" install "${args[@]}"
if [[ $tag == *-rc.* ]]; then agent-office-release pause; fi
