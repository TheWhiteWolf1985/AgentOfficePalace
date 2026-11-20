import argparse
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import create_vm as vm


class ProvisionTest(unittest.TestCase):
    def select(self, name='office', storage=None, used=(), available=40):
        def api(endpoint, *args):
            if endpoint.endswith('/storage'):
                return [dict(storage='local-lvm', active=1, avail=available * 2**30)]
            if endpoint.endswith('/network'):
                return [dict(iface='vmbr0', type='bridge', active=1)]
            if endpoint == '/cluster/nextid':
                return 123
            if endpoint == '/cluster/resources':
                return [dict(name=n) for n in used]
            self.fail(endpoint)
        args = argparse.Namespace(vmid=None, name=name, storage=storage, bridge=None, yes=True)
        with patch.object(vm, 'api', api):
            return vm.selection(args, 'pve')

    def test_default_uses_available_node_resources(self):
        self.assertEqual(self.select(), ('123', 'office', 'local-lvm', 'vmbr0'))

    def test_invalid_or_occupied_targets(self):
        for options in [dict(used=['office']), dict(storage='missing'), dict(available=10), dict(name='bad;name')]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.select(**options)

    def test_tampered_download(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'release.json'
            path.write_bytes(b'test')
            vm.verify(path, 'sha256', hashlib.sha256(b'test').hexdigest())
            with self.assertRaises(ValueError):
                vm.verify(path, 'sha256', '0' * 64)

    def test_failed_guest_stops_before_reporting_url(self):
        with patch.object(vm, 'guest', return_value='ERRORE download'), self.assertRaisesRegex(RuntimeError, 'download'):
            vm.wait_ready('123')


if __name__ == '__main__':
    unittest.main()
