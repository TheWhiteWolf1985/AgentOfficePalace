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
python3 deploy/codex-agent/seccomp.py > "$work/package/distribution/codex-seccomp.json"
tar -C "$work/package" -czf "$out/agent-office-linux-amd64.tgz" .
image="aop-codex:release-$commit"
docker build --tag "$image" deploy/codex-agent
image_id=$(docker image inspect --format '{{.Id}}' "$image")
docker run --rm --entrypoint /bin/sh "$image" -ec 'codex --version; bwrap --version; rg --pcre2-version'
docker save "$image" | gzip -1 > "$out/codex-agent-linux-amd64.tgz"
cp deploy/debian/{agent-office-release.py,install.sh} "$out/"
python3 - "$out" "$version" "$commit" "$image_id" <<'PY'
import hashlib, json, sys
from pathlib import Path
out, version, commit, image = sys.argv[1:]
root = Path(out)
assets = {}
for name in ('agent-office-linux-amd64.tgz', 'codex-agent-linux-amd64.tgz', 'agent-office-release.py'):
    with (root / name).open('rb') as f:
        assets[name] = hashlib.file_digest(f, 'sha256').hexdigest()
manifest = dict(schema=1, version=version, commit=commit, platform='debian13-amd64', image=image, sha256=assets)
(root / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
PY
python3 deploy/proxmox/make-launcher.py "${PREVIEW_TAG:-v$version}" "$out"
