import unittest
from gate_revisioni import valuta_gate

HEAD = "a" * 40
OLD = "b" * 40

def review(user, id, commit=HEAD, state="APPROVED", dismissed=False):
    return {"id": id, "submitted_at": "2026-11-13T07:20:00Z", "user": {"login": user},
            "commit_id": commit, "state": state, "dismissed": dismissed}

class GateTests(unittest.TestCase):
    def test_ordine_corretto(self):
        self.assertTrue(valuta_gate(HEAD, [review("capoanalista", 1), review("capoeditore", 2)]).verde)
    def test_ordine_invertito(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoeditore", 1), review("capoanalista", 2)]).verde)
    def test_revisione_vecchia(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1, OLD), review("capoeditore", 2)]).verde)
    def test_richiesta_correttiva_blocca(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1), review("capoeditore", 2), review("capoanalista", 3, state="REQUEST_CHANGES")]).verde)
    def test_analisi_ripetuta_richiede_nuova_editoria(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1), review("capoeditore", 2), review("capoanalista", 3)]).verde)
    def test_rosso_richiede_nuovo_commit_anche_dopo_approvazione(self):
        items = [review("capoanalista", 1, state="REQUEST_CHANGES"),
                 review("capoanalista", 2), review("capoeditore", 3)]
        self.assertFalse(valuta_gate(HEAD, items).verde)
    def test_rosso_vecchio_non_blocca_nuovo_commit(self):
        items = [review("capoanalista", 1, OLD, state="REQUEST_CHANGES"),
                 review("capoanalista", 2), review("capoeditore", 3)]
        self.assertTrue(valuta_gate(HEAD, items).verde)
    def test_data_senza_fuso_blocca(self):
        r = review("capoanalista", 1)
        r["submitted_at"] = "2026-11-13T07:20:00"
        self.assertFalse(valuta_gate(HEAD, [r, review("capoeditore", 2)]).verde)
    def test_revoca_non_ignorata(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1), review("capoeditore", 2), review("capoeditore", 3, dismissed=True)]).verde)
    def test_dati_incompleti_bloccano(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1), {"user":{"login":"capoeditore"}, "state":"APPROVED"}]).verde)
    def test_non_basta_lo_stesso_revisore(self):
        self.assertFalse(valuta_gate(HEAD, [review("capoanalista", 1)], "capoanalista", "capoanalista").verde)
    def test_commento_non_annulla_esito(self):
        self.assertTrue(valuta_gate(HEAD, [review("capoanalista", 1), review("capoeditore", 2), review("capoanalista", 3, state="COMMENTED")]).verde)

if __name__ == "__main__":
    unittest.main()
