"""Regression tests for the release switch. The system service is exercised on a Debian guest."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manager', Path(__file__).with_name('agent-office-release.py'))
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


proxy_spec = importlib.util.spec_from_file_location('proxy', Path(__file__).with_name('agent-office-proxy.py'))
proxy = importlib.util.module_from_spec(proxy_spec)
proxy_spec.loader.exec_module(proxy)


gui_spec = importlib.util.spec_from_file_location('office_updates', Path(__file__).with_name('office-updates.py'))
gui = importlib.util.module_from_spec(gui_spec)
gui_spec.loader.exec_module(gui)


class GraphicalUpdateTest(unittest.TestCase):
    def test_candidate_install_prepares_identities_only_for_managed_forgejo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'forgejo').mkdir()
            with patch.object(gui, 'ETC', root), patch.object(gui, 'UNIT', root), patch.object(gui.release, 'run') as run:
                gui.install()
                run.assert_any_call(gui.sys.executable, '-I', Path(gui.__file__).with_name('office-tunnel.py'))
                provision = (gui.sys.executable, '-I', Path(gui.__file__).with_name('office-forgejo.py'), 'agent-admin', '127.0.0.1')
                self.assertNotIn(provision, [c.args for c in run.call_args_list])
                (root / 'forgejo/ready').touch()
                run.reset_mock()
                gui.install()
                self.assertEqual(run.call_args_list[0].args, provision)
                self.assertEqual([c.args for c in run.call_args_list].count(provision), 1)

    def test_catalog_skips_drafts_old_formats_and_malformed_tags(self):
        def row(tag, draft=False, complete=True):
            return dict(tag_name=tag, prerelease='-rc.' in tag, draft=draft, body=tag,
                        assets=[{'name': a} for a in (manager.ARCHIVE, manager.IMAGE, 'release.json')] if complete else [])
        rows = [row('v0.1.310-rc.12'), row('v0.1.309'), row('v0.1.310-rc.2'), row('v0.1.399', True),
                row('latest'), row('v0.1.402', complete=False)]
        self.assertEqual(gui.newest(rows, 'stable')['tag'], 'v0.1.309')
        self.assertEqual(gui.newest(rows, 'preview')['tag'], 'v0.1.310-rc.12')
        self.assertEqual(gui.newest(rows + [row('v0.1.310')], 'preview')['tag'], 'v0.1.310')

    def test_saved_channel_job_and_exact_target(self):
        tag = 'v0.1.307-rc.9'
        listing = {'latest': {'tag': tag, 'notes': 'Nuovi uffici'}}
        with tempfile.TemporaryDirectory() as tmp, patch.object(gui, 'ETC', Path(tmp)), \
                patch.object(gui, 'installed', return_value='v0.1.306-rc.8'), patch.object(gui, 'catalog', return_value=listing), \
                patch.object(gui.release, 'run') as start:
            self.assertEqual(gui.request({'action':'status'})['channel'], 'stable')
            self.assertEqual(gui.request({'action':'channel','channel':'preview'})['channel'], 'preview')
            with self.assertRaises(ValueError):
                gui.request({'action':'apply','tag':'v0.1.308-rc.10'})
            self.assertEqual(gui.request({'action':'apply','tag':tag})['job']['phase'], 'waiting')
            gui.request({'action':'apply','tag':tag})
            start.assert_called_once()
            with self.assertRaises(ValueError):
                gui.request({'action':'channel','channel':'stable'})

    def test_busy_agent_defers_and_unreachable_activity_never_restarts_office(self):
        import io
        with tempfile.TemporaryDirectory() as tmp, patch.object(gui, 'ETC', Path(tmp)):
            (Path(tmp) / 'activity.env').write_text('AOP_RELEASE_PROBE=abc')
            with patch.object(gui.urllib.request, 'urlopen', side_effect=[io.BytesIO(b'{"busy":1}'), io.BytesIO(b'{"busy":0}')]), patch.object(gui.time, 'sleep') as pause:
                gui.wait_idle()
                pause.assert_called_once()
            with patch.object(gui.urllib.request, 'urlopen', side_effect=OSError):
                with self.assertRaises(OSError):
                    gui.wait_idle()


class ExplicitUpdateTest(unittest.TestCase):
    def test_explicit_update_requires_a_manual_local_delivery(self):
        import contextlib
        import io
        import sys
        for args in (['update'], ['install', '--from-dir', '/tmp/kit'],
                     ['update', '--scheduled', '--from-dir', '/tmp/kit']):
            with self.subTest(args=args), patch.object(sys, 'argv', ['manager', *args, '--explicit-release']), contextlib.redirect_stderr(io.StringIO()) as error:
                with self.assertRaises(SystemExit) as result:
                    manager.main()
                self.assertEqual(result.exception.code, 2)
                self.assertIn('--explicit-release richiede', error.getvalue())


class ProxyTest(unittest.TestCase):
    def test_selects_assigned_route_source_and_rejects_nonlocal_override(self):
        interfaces = json.dumps([{'addr_info': [{'family': 'inet', 'scope': 'global', 'local': '10.8.6.5'}]}])
        with patch.object(proxy, 'run', side_effect=[interfaces, '[{"prefsrc": "10.8.6.5"}]']):
            self.assertEqual(proxy.address(None), '10.8.6.5')
        with patch.object(proxy, 'run', return_value=interfaces), self.assertRaises(ValueError):
            proxy.address('10.8.6.9')

    def test_forgejo_keeps_other_sections_and_uses_the_external_port(self):
        original = '[server]\nHTTP_PORT = 3000\n\n[database]\nPATH = /some/data.db\n'
        result = proxy.forgejo_settings(original, '10.8.6.5')
        self.assertIn('ROOT_URL = https://10.8.6.5:8443/\n', result)
        self.assertIn('LOCAL_ROOT_URL = http://127.0.0.1:3000/\n', result)
        self.assertTrue(result.endswith('[database]\nPATH = /some/data.db\n'))
        self.assertEqual(proxy.forgejo_settings(result, '10.8.6.5'), result)


class PackageBoundaryTest(unittest.TestCase):
    def test_rejects_runtime_identity_and_private_paths_in_compressed_assets(self):
        import gzip
        import runpy
        policy = runpy.run_path(str(Path(__file__).with_name('check-delivery.py')))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in policy['TOP'] - {'bin', 'dist'}:
                (root / name).write_text('test')
            (root / 'bin').mkdir()
            public = root / 'dist/public'
            public.mkdir(parents=True)
            policy['check'](root, set())
            secret = public / 'auth.json'
            secret.write_text('{}')
            with self.assertRaises(ValueError):
                policy['check'](root, set())
            secret.unlink()
            private = public / 'shared-codex'
            private.mkdir()
            (private / 'account.json').write_text('{}')
            with self.assertRaises(ValueError):
                policy['check'](root, set())
            (private / 'account.json').unlink()
            private.rmdir()
            (public / 'model.glb.gz').write_bytes(gzip.compress(b'C:/Users/example/Documents/export'))
            with self.assertRaises(ValueError):
                policy['check'](root, set())


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

    def test_service_can_traverse_extracted_program_under_private_installer_umask(self):
        tree = self.root / 'payload'
        helper = tree / 'distribution' / manager.MANAGER
        helper.parent.mkdir(parents=True)
        helper.write_text('manager')
        (tree / 'bin').mkdir()
        archive = self.root / 'program.tgz'
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(tree, arcname='.')
        release = SimpleNamespace(target=self.root / 'releases/v1.0.3',
                                  manifest={'sha256': {manager.MANAGER: manager.digest(helper)}, 'image': 'test'},
                                  asset=lambda name, dest: archive)
        def check_service_access(*args, cwd=None):
            self.assertEqual(cwd.stat().st_mode & 0o005, 0o005)
            self.assertEqual((cwd / 'bin').stat().st_mode & 0o005, 0o005)
        mask = os.umask(0o077)
        try:
            with patch.object(manager, 'run', check_service_access), patch.object(manager, 'docker', return_value=['docker']), \
                    patch.object(manager.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
                manager.stage(release)
            self.assertEqual(os.umask(0o077), 0o077)
        finally:
            os.umask(mask)

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

    def test_stable_build_replaces_local_build_of_the_same_commit(self):
        m = dict(schema=1, platform='debian13-amd64', version='1.0.2', commit='a' * 40, image='sha256:' + 'b' * 64,
                 sha256={n: 'a' * 64 for n in (manager.ARCHIVE, manager.IMAGE, manager.MANAGER)})
        (self.new / 'release.json').write_text(json.dumps(m))
        m['sha256'][manager.ARCHIVE] = 'b' * 64
        (self.root / 'release.json').write_text(json.dumps(m))
        stable = manager.Release(self.root)
        self.assertNotEqual(stable.target, self.new)
        self.assertRegex(stable.target.name, manager.SLOT)
        self.assertEqual(manager.Release(self.root).target, stable.target)
        m['commit'] = 'c' * 40
        (self.root / 'release.json').write_text(json.dumps(m))
        with self.assertRaises(ValueError):
            manager.Release(self.root)

    def test_corrupt_archive_and_unsafe_versions_are_rejected(self):
        manifest = dict(schema=1, platform='debian13-amd64', version='1.0.2', commit='a' * 40, image='sha256:' + 'b' * 64,
                        sha256={n: hashlib.sha256(b'expected').hexdigest() for n in (manager.ARCHIVE, manager.IMAGE, manager.MANAGER)})
        path = self.root / 'release.json'
        (self.new / 'release.json').write_text(json.dumps(manifest))
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
