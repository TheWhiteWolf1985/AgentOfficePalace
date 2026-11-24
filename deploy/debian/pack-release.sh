#!/bin/bash
# Assemble the application that was actually tested, including its Linux runtime.
set -euo pipefail
if [[ $# != 3 ]]; then echo "Usage: pack-release.sh OUTPUT VERSION COMMIT" >&2; exit 2; fi
out=$(realpath -m "$1")
version=$2
commit=$3
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $commit =~ ^[0-9a-f]{40}$ ]]
[[ $(uname -m) == x86_64 && $(node -p 'process.versions.node.split(".")[0]') == 22 ]]
mkdir -p "$out"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
tar -xzf "$out/agent-office.tgz" -C "$work"
python3 deploy/debian/check-delivery.py "$work/package"
(
  cd "$work/package"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
  node -e "require('@lydell/node-pty').spawn('/bin/true', [], {name:'xterm'})"
)
install -m755 "$(command -v node)" "$work/package/bin/node"
node --version > "$work/package/node-version"
cp LICENSE "$work/package/LICENSE"
node -p 'process.release.sourceUrl' > "$work/package/node-source-url"
curl --fail --silent --show-error --location --proto '=https' "https://raw.githubusercontent.com/nodejs/node/$(node --version)/LICENSE" -o "$work/package/NODE-LICENSE"
mkdir -p "$work/package/distribution"
cp deploy/debian/agent-office-release.py "$work/package/distribution/"
install -m755 deploy/debian/agent-office-proxy.py "$work/package/distribution/agent-office-proxy.py"
install -m644 deploy/debian/{office-forgejo.py,register-reader.mjs} "$work/package/distribution/"
forgejo=forgejo-17.0.2-linux-amd64
curl --fail --silent --show-error --location --retry 3 --proto '=https' --proto-redir '=https' \
  "https://codeberg.org/forgejo/forgejo/releases/download/v17.0.2/$forgejo" -o "$work/package/distribution/forgejo"
echo "760cf8c6da9fb344908eebd1ebf920b79620fce6ebb22efa8f8c1e483652c1ee  $work/package/distribution/forgejo" | sha256sum -c -
chmod 755 "$work/package/distribution/forgejo"
curl --fail --silent --show-error --location --retry 3 --proto '=https' --proto-redir '=https' \
  https://codeberg.org/forgejo/forgejo/raw/tag/v17.0.2/LICENSE -o "$work/package/distribution/FORGEJO-LICENSE"
echo https://codeberg.org/forgejo/forgejo/src/tag/v17.0.2 > "$work/package/distribution/FORGEJO-SOURCE"
python3 deploy/codex-agent/seccomp.py > "$work/package/distribution/codex-seccomp.json"
tar -C "$work/package" -czf "$out/agent-office-linux-amd64.tgz" .
image="aop-codex:release-$commit"
docker build --tag "$image" deploy/codex-agent
docker run --rm --network=none --entrypoint /bin/sh "$image" -ec '
  test ! -e /root/.codex
  test ! -e /root/.git-credentials
  test ! -e /root/.ssh/authorized_keys
  test -z "$(ls -A /workspace)"
  codex --version; bwrap --version; rg --pcre2-version'
plugin=$(node --input-type=module -e "import {pluginImageTag} from './dist/server/server/plugin-service.js'; console.log(await pluginImageTag('bin/plugin-skills'))")
docker build --tag "$plugin" bin/plugin-skills
docker run --rm --network=none --entrypoint /bin/sh "$plugin" -ec 'pdfinfo -v; tesseract --list-langs | grep -qx ita; tesseract --list-langs | grep -qx eng'
docker save "$image" "$plugin" | gzip -1 > "$out/codex-agent-linux-amd64.tgz"
python3 deploy/debian/check-images.py "$out/codex-agent-linux-amd64.tgz"
cp deploy/debian/{agent-office-release.py,install.sh} "$out/"
python3 - "$out" "$version" "$commit" "$image" "$plugin" <<'PY'
import hashlib, json, sys, tarfile
from pathlib import Path
out, version, commit, image_tag, plugin = sys.argv[1:]
root = Path(out)
# A containerd-backed builder can report the index digest as .Id. Debian Docker
# identifies a loaded image by the digest of the config bytes inside docker save.
with tarfile.open(root / 'codex-agent-linux-amd64.tgz') as tar:
    entries = json.load(tar.extractfile('manifest.json'))
    configs = {row['Config'] for row in entries
               if any(tag.split('/')[-1] == image_tag for tag in (row.get('RepoTags') or []))}
    if len(configs) != 1:
        raise ValueError('Il tag deve identificare una sola immagine esportata')
    config_bytes = tar.extractfile(configs.pop()).read()
    cfg = json.loads(config_bytes)
    if (cfg['os'], cfg['architecture']) != ('linux', 'amd64'):
        raise ValueError('Piattaforma immagine agente inattesa')
    image = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
assets = {}
for name in ('agent-office-linux-amd64.tgz', 'codex-agent-linux-amd64.tgz', 'agent-office-release.py'):
    with (root / name).open('rb') as f:
        assets[name] = hashlib.file_digest(f, 'sha256').hexdigest()
manifest = dict(schema=1, version=version, commit=commit, platform='debian13-amd64', image=image, sha256=assets)
manifest['pluginTag'] = plugin
(root / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY
python3 deploy/proxmox/make-launcher.py "${PREVIEW_TAG:-v$version}" "$out"
manifest_hash=$(sha256sum "$out/release.json" | cut -d' ' -f1)
sed -i "s/@RELEASE_TAG@/${PREVIEW_TAG:-v$version}/g;s/@MANIFEST_SHA256@/$manifest_hash/g" "$out/install.sh"
