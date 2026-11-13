import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from identita_revisioni import identita_revisioni

class IdentitaRevisioniTests(unittest.TestCase):
    def test_legacy_without_policy(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"MAROS_CONNECTION_POLICY": folder + "/missing"}):
            self.assertEqual(identita_revisioni("org/wiki"), ("capoanalista", "capoeditore"))

    def test_policy_uses_the_configured_repository_roles(self):
        with tempfile.TemporaryDirectory() as folder:
            policy = Path(folder) / "policy.json"
            policy.write_text(json.dumps({"accounts": [{"id": "a", "username": "reviewer_a"}, {"id": "e", "username": "reviewer_e"}], "bindings": [{"controlled": True, "repository": "org/wiki", "roles": {"capoanalista": "a", "capoeditore": "e"}}]}))
            with patch.dict(os.environ, {"MAROS_CONNECTION_POLICY": str(policy)}):
                self.assertEqual(identita_revisioni("org/wiki"), ("reviewer_a", "reviewer_e"))
                with self.assertRaises(ValueError):
                    identita_revisioni("other/wiki")

    def test_corrupt_policy_does_not_fall_back_to_legacy_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            policy = Path(folder) / "policy.json"
            policy.write_text("invalid")
            with patch.dict(os.environ, {"MAROS_CONNECTION_POLICY": str(policy)}):
                with self.assertRaises(ValueError):
                    identita_revisioni("org/wiki")

if __name__ == "__main__":
    unittest.main()
