"""Valuta i gate della revisione Forgejo, senza eseguire il merge."""
from dataclasses import dataclass
from datetime import datetime

@dataclass(frozen=True)
class Esito:
    verde: bool
    motivo: str

def _chiave(review):
    stamp = review.get("submitted_at")
    ident = review.get("id")
    if not isinstance(stamp, str) or not stamp or not isinstance(ident, int):
        raise ValueError("Revisione priva di data o identificativo")
    parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Fuso orario della revisione mancante")
    return (parsed, ident)

def valuta_gate(head, reviews, analista="capoanalista", editore="capoeditore"):
    if not isinstance(head, str) or len(head) != 40 or any(c not in "0123456789abcdefABCDEF" for c in head):
        return Esito(False, "Commit della PR non valido")
    if not analista or not editore or analista.casefold() == editore.casefold():
        return Esito(False, "Identita dei revisori non distinte")
    if not isinstance(reviews, list):
        return Esito(False, "Elenco revisioni non disponibile")
    per_ruolo = {}
    for review in reviews:
        if not isinstance(review, dict):
            return Esito(False, "Revisione non valida")
        user = (review.get("user") or {}).get("login", "")
        if not isinstance(user, str):
            return Esito(False, "Identita della revisione non valida")
        role = user.casefold()
        if role not in (analista.casefold(), editore.casefold()):
            continue
        state = str(review.get("state", "")).upper()
        if state in ("PENDING", "COMMENTED"):
            continue
        # A red gate requires a new revision, even if someone later approves the same commit.
        if state == "REQUEST_CHANGES" and str(review.get("commit_id", "")).lower() == head.lower():
            return Esito(False, "Una richiesta di correzione richiede un nuovo commit")
        try:
            key = _chiave(review)
        except (ValueError, TypeError):
            return Esito(False, "Ordine delle revisioni non verificabile")
        if role not in per_ruolo or key > per_ruolo[role][0]:
            per_ruolo[role] = (key, review)
    for role, name in ((analista.casefold(), "Analista"), (editore.casefold(), "Editore")):
        if role not in per_ruolo:
            return Esito(False, f"Approvazione {name} mancante")
        rev = per_ruolo[role][1]
        if rev.get("dismissed") or str(rev.get("state", "")).upper() != "APPROVED":
            return Esito(False, f"Gate {name} non approvato")
        if str(rev.get("commit_id", "")).lower() != head.lower():
            return Esito(False, f"Gate {name} riferito a un altro commit")
    if per_ruolo[analista.casefold()][0] >= per_ruolo[editore.casefold()][0]:
        return Esito(False, "L'Editore deve approvare dopo l'Analista")
    return Esito(True, "Revisioni ordinate sul commit corrente")

if __name__ == "__main__":
    import json
    import sys
    try:
        obj = json.load(sys.stdin)
        result = valuta_gate(obj.get("head"), obj.get("reviews"))
        json.dump({"verde": result.verde, "motivo": result.motivo}, sys.stdout)
    except Exception:
        json.dump({"verde": False, "motivo": "Impossibile verificare le revisioni"}, sys.stdout)
        sys.exit(1)
