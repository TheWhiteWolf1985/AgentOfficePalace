#!/usr/bin/env python3
"""Operazioni Forgejo per i responsabili dell'ufficio Documentazione."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from gate_revisioni import valuta_gate, _chiave

BASE = os.environ.get("AGENT_OFFICE_REMOTE_URL", "http://192.168.1.76:3000").rstrip("/") + "/api/v1"
TOKEN = Path("/run/maros-role/forgejo-token")
ANALYST = os.environ.get("AGENT_OFFICE_ROLE_CAPOANALISTA") or "capoanalista"
EDITOR = os.environ.get("AGENT_OFFICE_ROLE_CAPOEDITORE") or "capoeditore"

def git(*args):
    return subprocess.check_output(["git", *args], text=True, stderr=subprocess.STDOUT).strip()

def repo_path():
    url = git("remote", "get-url", "origin")
    if os.environ.get("AGENT_OFFICE_REMOTE_ACCOUNT"):
        repo = os.environ.get("AGENT_OFFICE_REMOTE_REPOSITORY", "")
        base_host = urllib.parse.urlsplit(BASE).hostname
        parsed_url = urllib.parse.urlsplit(re.sub(r"^git@" + re.escape(str(base_host)) + ":", "ssh://git@" + str(base_host) + "/", url))
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or parsed_url.hostname != base_host or not parsed_url.path.removesuffix(".git").endswith("/" + repo):
            raise ValueError("Il checkout non corrisponde alla connessione assegnata")
        return "/repos/" + "/".join(urllib.parse.quote(p, safe="") for p in repo.split("/"))
    m = re.fullmatch(r"ssh://git@192\.168\.1\.76:2222/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?", url)
    if not m:
        raise ValueError("Il repository non punta al Forgejo autorizzato dell'ufficio")
    return "/repos/" + urllib.parse.quote(m[1], safe="") + "/" + urllib.parse.quote(m[2], safe="")

def request(method, endpoint, payload=None):
    token = os.environ.get("AGENT_OFFICE_REMOTE_TOKEN") or TOKEN.read_text().strip()
    if not token:
        raise ValueError("Credenziale del ruolo non disponibile")
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + endpoint, data=data, method=method, headers={
        "Authorization": "token " + token, "Content-Type": "application/json", "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        msg = e.read(4096).decode("utf8", "replace")
        raise ValueError("Forgejo ha rifiutato l'operazione (HTTP %s): %s" % (e.code, msg[:400])) from None

def all_reviews(path):
    result = []
    for page in range(1, 21):
        rows = request("GET", path + "/reviews?limit=50&page=" + str(page))
        if not isinstance(rows, list):
            raise ValueError("Elenco revisioni Forgejo non valido")
        result.extend(rows)
        if len(rows) < 50:
            return result
    raise ValueError("Troppe revisioni: controllo incompleto")

def main():
    parser = argparse.ArgumentParser(description="Pull request Forgejo per i capi ufficio")
    sub = parser.add_subparsers(dest="cmd", required=True)
    create = sub.add_parser("crea")
    create.add_argument("--titolo", required=True)
    create.add_argument("--descrizione", required=True)
    create.add_argument("--base", default="main")
    status = sub.add_parser("stato")
    status.add_argument("numero", type=int)
    review = sub.add_parser("revisione")
    review.add_argument("numero", type=int)
    review.add_argument("--esito", choices=("approva", "correggi"), required=True)
    review.add_argument("--nota", required=True)
    review.add_argument("--commit", required=True, help="SHA integrale effettivamente esaminato")
    args = parser.parse_args()
    user = request("GET", "/user").get("login", "").lower() if args.cmd != "stato" else ""
    role = os.environ.get("AGENT_OFFICE_REMOTE_ROLE") or user
    if args.cmd != "stato" and os.environ.get("AGENT_OFFICE_REMOTE_ACCOUNT") and user != os.environ.get("AGENT_OFFICE_REMOTE_LOGIN", "").lower():
        raise ValueError("La credenziale appartiene a un'altra identita")
    repo = repo_path()
    if args.cmd == "crea":
        if role != "caporedattore":
            raise ValueError("Solo il Caporedattore puo creare la pull request")
        if args.base != "main":
            raise ValueError("La base autorizzata e main")
        if not args.titolo.strip() or not args.descrizione.strip():
            raise ValueError("Titolo e descrizione sono obbligatori")
        branch = git("symbolic-ref", "--quiet", "--short", "HEAD")
        if branch == "main":
            raise ValueError("Creare un branch dedicato prima di aprire la PR")
        git("check-ref-format", "--branch", branch)
        if git("status", "--porcelain"):
            raise ValueError("Completare i commit prima di aprire la PR")
        head = git("rev-parse", "HEAD")
        git("push", "origin", "HEAD:refs/heads/" + branch)
        obj = request("POST", repo + "/pulls", {"head": branch, "base": "main", "title": args.titolo, "body": args.descrizione})
        if obj.get("head", {}).get("sha") != head:
            raise ValueError("La PR non riporta il commit appena pubblicato: verifica necessaria")
        print(json.dumps({"numero": obj["number"], "url": obj["html_url"], "commit": head}, ensure_ascii=False))
        return
    if args.numero <= 0:
        raise ValueError("Numero PR non valido")
    path = repo + "/pulls/" + str(args.numero)
    pr = request("GET", path)
    if pr.get("state") != "open" or pr.get("base", {}).get("ref") != "main":
        raise ValueError("Serve una PR aperta diretta a main")
    head = pr.get("head", {}).get("sha", "")
    reviews = all_reviews(path)
    if args.cmd == "stato":
        outcome = valuta_gate(head, reviews, ANALYST, EDITOR)
        print(json.dumps({"commit": head, "verde": outcome.verde, "motivo": outcome.motivo}, ensure_ascii=False))
        return
    if not re.fullmatch(r"[0-9a-fA-F]{40}", args.commit) or args.commit.lower() != head.lower():
        raise ValueError("La revisione richiesta non coincide con il commit corrente della PR")
    if git("rev-parse", "HEAD").lower() != head.lower() or git("status", "--porcelain"):
        raise ValueError("Eseguire la revisione dal checkout pulito del commit esaminato")
    if role not in ("capoanalista", "capoeditore"):
        raise ValueError("Solo i capi Analista ed Editore possono registrare una revisione")
    if not args.nota.strip():
        raise ValueError("La revisione deve essere motivata")
    if args.esito == "approva":
        for r in reviews:
            who = (r.get("user") or {}).get("login", "").lower()
            if (who in (ANALYST.lower(), EDITOR.lower())
                and str(r.get("state", "")).upper() == "REQUEST_CHANGES"
                and str(r.get("commit_id", "")).lower() == head.lower()):
                raise ValueError("Un gate rosso richiede prima un nuovo commit del Caporedattore")
    if role == "capoeditore":
        candidates = [r for r in reviews if (r.get("user") or {}).get("login", "").lower() == ANALYST.lower()
                      and str(r.get("state", "")).upper() not in ("PENDING", "COMMENTED")]
        try:
            latest = max(candidates, key=_chiave)
        except (ValueError, TypeError):
            raise ValueError("Prima serve un'approvazione verificabile dell'Analista") from None
        if latest.get("dismissed") or latest.get("state", "").upper() != "APPROVED" or latest.get("commit_id", "").lower() != head.lower():
            raise ValueError("Prima serve un'approvazione dell'Analista sul commit corrente")
    if role == "capoeditore" and args.esito == "approva":
        checked = subprocess.run([sys.executable, "-B", "/opt/maros-pipeline/wiki_checks.py",
                                  "--vault", git("rev-parse", "--show-toplevel"),
                                  "--base", pr["base"]["sha"]], capture_output=True, text=True, timeout=300)
        try:
            report = json.loads(checked.stdout)
        except ValueError:
            raise ValueError("Esito dei checker editoriali non disponibile") from None
        if checked.returncode or not report.get("passed") or report.get("commit") != head:
            raise ValueError("I tre checker devono essere superati sul commit da approvare")
    current = request("GET", path)
    if (current.get("state") != "open" or current.get("head", {}).get("sha") != head
        or current.get("base", {}).get("sha") != pr.get("base", {}).get("sha")):
        raise ValueError("La PR e cambiata durante la revisione: ricominciare dal commit corrente")
    if role == "capoeditore" and args.esito == "approva":
        proposed = {"id": 2147483647, "submitted_at": "9999-01-01T00:00:00Z",
                    "user": {"login": "capoeditore"}, "state": "APPROVED", "commit_id": head}
        outcome = valuta_gate(head, all_reviews(path) + [proposed])
        if not outcome.verde:
            raise ValueError("Gate modificati durante i controlli: " + outcome.motivo)
    event = "APPROVED" if args.esito == "approva" else "REQUEST_CHANGES"
    obj = request("POST", path + "/reviews", {"event": event, "body": args.nota, "commit_id": head})
    if obj.get("commit_id", "").lower() != head.lower():
        raise ValueError("Revisione registrata su un commit diverso: verifica necessaria")
    print(json.dumps({"revisore": user, "esito": event, "commit": head, "url": obj.get("html_url", "")}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, urllib.error.URLError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
