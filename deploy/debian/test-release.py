"""Regression tests for the release switch. The system service is exercised on a Debian guest."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manager', Path(__file__).with_name('agent-office-release.py'))
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        p = patch.object(manager, 'ROOT', self.root)
        p.start()
        self.addCleanup(p.stop)
        self.old, self.new = [self.root / 'releases' / v for v in ('v1.0.1', 'v1.0.2')]
        for d in (self.old, self.new):
            d.mkdir(parents=True)
        manager.link(self.root / 'current', self.old)

    def start(self, target):
        manager.link(self.root / 'current', target)
        if target == self.new:
            raise RuntimeError('Smoke test failed')

    def test_health_failure_restores_running_release(self):
        with patch.object(manager, 'start', self.start), self.assertRaises(RuntimeError):
            manager.activate(self.new)
        self.assertEqual(manager.current(), self.old)
        self.assertFalse((self.root / 'pending').exists())

    def test_interrupted_switch_recovers_before_next_operation(self):
        (self.root / 'pending').write_text(self.old.name)
        manager.link(self.root / 'current', self.new)
        with patch.object(manager, 'start', self.start):
            manager.recover()
        self.assertEqual(manager.current(), self.old)

    def test_first_start_does_not_reset_an_unloaded_unit(self):
        from subprocess import CompletedProcess
        with patch.object(manager.subprocess, 'run', return_value=CompletedProcess([], 1)), \
                patch.object(manager, 'run') as execute, patch.object(manager, 'healthy', return_value=True):
            manager.start(self.new)
        execute.assert_called_once_with('systemctl', 'restart', manager.SERVICE)

    def test_successful_switch_preserves_rollback_target(self):
        with patch.object(manager, 'start', lambda path: manager.link(self.root / 'current', path)):
            manager.activate(self.new)
        self.assertEqual(manager.current(), self.new)
        self.assertEqual(manager.current('previous'), self.old)

    def test_corrupt_archive_and_unsafe_versions_are_rejected(self):
        manifest = dict(schema=1, platform='debian13-amd64', version='1.0.2', commit='a' * 40, image='sha256:' + 'b' * 64,
                        sha256={n: hashlib.sha256(b'expected').hexdigest() for n in (manager.ARCHIVE, manager.IMAGE, manager.MANAGER)})
        path = self.root / 'release.json'
        path.write_text(json.dumps(manifest))
        (self.root / manager.ARCHIVE).write_bytes(b'incorrect')
        with self.assertRaises(ValueError):
            manager.Release(self.root).asset(manager.ARCHIVE, self.root)
        manifest['version'] = '../../oops'
        path.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            manager.Release(self.root)


if __name__ == '__main__':
    unittest.main()
