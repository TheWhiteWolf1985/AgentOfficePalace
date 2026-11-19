#!/bin/sh
set -eu
umask 077
if ! codex login status >/dev/null 2>&1; then
    printf '%s\n' 'Codex · Impostazioni → Gestione agenti → Modifica proprietà → Accesso Codex'
    until codex login status >/dev/null 2>&1; do sleep 3; done
fi
exec codex "$@"
