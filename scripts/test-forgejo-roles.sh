#!/usr/bin/env bash
# Run from a development checkout with Git, Node dependencies and the packaged Forgejo binary.
set -euo pipefail
forgejo=$(realpath "${1:?Supply the path to the Forgejo 17.0.2 binary}")
"$forgejo" --version | grep -q '17\.0\.2'
test "$(id -u)" != 0 || { echo 'Run as a regular user' >&2; exit 1; }
umask 077
d=$(mktemp -d)
pid=
cleanup() {
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
    rm -rf -- "$d"
}
trap cleanup EXIT
port=$(node -e "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
mkdir -p "$d/custom/conf"
cat >"$d/custom/conf/app.ini" <<EOF
RUN_USER = $(id -un)
WORK_PATH = $d
[database]
DB_TYPE = sqlite3
PATH = $d/forgejo.db
[server]
HTTP_ADDR = 127.0.0.1
HTTP_PORT = $port
ROOT_URL = http://127.0.0.1:$port/
DISABLE_SSH = true
[security]
INSTALL_LOCK = true
[service]
DISABLE_REGISTRATION = true
[actions]
ENABLED = false
[log]
LEVEL = Error
EOF
"$forgejo" -w "$d" migrate >"$d/setup.log" 2>&1
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$d/password"
"$forgejo" -w "$d" admin user create --username roleqa --email roleqa@office.invalid --admin \
    --password "$(cat "$d/password")" --must-change-password=false >>"$d/setup.log" 2>&1
"$forgejo" -w "$d" web >"$d/server.log" 2>&1 &
pid=$!
export AOP_TEST_FORGEJO_URL="http://127.0.0.1:$port"
export AOP_TEST_FORGEJO_PASSWORD_FILE="$d/password"
for _ in {1..60}; do
    kill -0 "$pid" || { cat "$d/server.log" >&2; exit 1; }
    if curl -fsS "$AOP_TEST_FORGEJO_URL/api/healthz" >/dev/null 2>&1; then break; fi
    sleep 1
done
node --import tsx --test tests/forgejo-agent-live.test.ts
