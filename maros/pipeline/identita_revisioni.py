"""Identita di revisione dichiarate dalla configurazione amministrativa dell'ufficio."""
import json
import os
from pathlib import Path

def identita_revisioni(repository):
    policy = Path(os.environ.get("MAROS_CONNECTION_POLICY", "/connections/policies.json"))
    if not policy.exists():
        return "capoanalista", "capoeditore"
    data = json.loads(policy.read_text())
    bindings = [b for b in data["bindings"] if b.get("controlled") and b["repository"] == repository]
    if len(bindings) != 1:
        raise ValueError("Configurazione delle identita documentali mancante o ambigua")
    accounts = {a["id"]: a["username"] for a in data["accounts"]}
    roles = bindings[0]["roles"]
    analyst, editor = accounts[roles["capoanalista"]], accounts[roles["capoeditore"]]
    if not analyst or not editor or analyst.casefold() == editor.casefold():
        raise ValueError("Identita di revisione non valide")
    return analyst, editor
