#!/usr/bin/env python3
"""Importa le identita gia presenti nella VM111, senza stampare credenziali."""
import argparse
import json
import os
import subprocess
from pathlib import Path
import time
import urllib.request
import urllib.error

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/srv/data/agent-office"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    target = root / "connessioni"
    if (target / "connections.json").exists():
        raise ValueError("Archivio connessioni gia presente: non viene sovrascritto")
    metadata = root / "data/workspace/documentazione/.agent-office"
    floors = json.loads((metadata / "floors.json").read_text())
    floor = next(f for f in floors if f["dir"] == "/data/workspace/documentazione")
    workers = json.loads((metadata / "workers.json").read_text())
    accounts = []
    secrets = {}
    for role in ("lettura", "caporedattore", "capoanalista", "capoeditore"):
        token = (root / "identita" / role / "forgejo-token").read_text().strip()
        req = urllib.request.Request("http://192.168.1.76:3000/api/v1/user", headers={"Authorization": "token " + token})
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                username = json.load(response)["login"]
        except urllib.error.HTTPError as error:
            if role != "lettura" or error.code != 403:
                raise
            if not args.apply:
                print(json.dumps({"verified": False, "needs_reader_identity_scope": True, "applied": False}))
                return
            token = subprocess.check_output(["docker", "exec", "--user", "1000:1000", "forgejo", "forgejo", "admin", "user", "generate-access-token", "--username", "ufficiolettura", "--token-name", "agent-office-gui-reader-" + str(int(time.time())), "--scopes", "read:user,read:repository,read:issue", "--raw"], text=True).strip()
            if not token or any(c.isspace() for c in token):
                raise ValueError("Token del lettore non generato")
            req = urllib.request.Request("http://192.168.1.76:3000/api/v1/user", headers={"Authorization": "token " + token})
            with urllib.request.urlopen(req, timeout=15) as response:
                username = json.load(response)["login"]
        expected = "ufficiolettura" if role == "lettura" else role
        if username != expected:
            raise ValueError("Identita del ruolo non corrispondente: " + role)
        accounts.append({"id": role, "serverId": "forgejo-ufficio", "name": expected, "username": username, "verifiedAt": int(time.time() * 1000)})
        secrets[role] = token
    agents = {w["id"]: {"role": {"desk-3": "caporedattore", "desk-7": "capoanalista", "desk-11": "capoeditore"}.get(w["deskId"], "lettura")} for w in workers}
    data = {"servers": [{"id": "forgejo-ufficio", "name": "Forgejo Agent Office", "provider": "forgejo", "url": "http://192.168.1.76:3000"}], "accounts": accounts,
            "bindings": [{"dir": floor["dir"], "floorId": floor["id"], "repository": "officeagents/documentazione", "accountId": "lettura", "controlled": True,
                          "roles": {role: role for role in secrets}, "agents": agents}]}
    if args.apply:
        for folder in (target, target / "accounts", target / "public"):
            folder.mkdir(parents=True, exist_ok=True, mode=0o700)
            os.chmod(folder, 0o700)
            os.chown(folder, 1000, 1000)
        for role, token in secrets.items():
            file = target / "accounts" / (role + ".env")
            file.write_text("TOKEN=" + json.dumps(token) + "\n")
            os.chmod(file, 0o600); os.chown(file, 1000, 1000)
        for file, value in ((target / "connections.json", data), (target / "public/policies.json", {"accounts": [{"id": a["id"], "username": a["username"]} for a in accounts], "bindings": data["bindings"]})):
            file.write_text(json.dumps(value, indent=2))
            os.chmod(file, 0o600); os.chown(file, 1000, 1000)
    print(json.dumps({"verified": True, "applied": args.apply, "accounts": [{"role": a["id"], "username": a["username"]} for a in accounts], "agents": len(agents)}))

if __name__ == "__main__":
    main()
