import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('tunnel', Path(__file__).with_name('office-tunnel.py'))
tunnel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tunnel)


class TunnelTest(unittest.TestCase):
    def test_effective_policy_must_block_every_other_channel(self):
        result = '\n'.join(k + ' ' + v for k, v in tunnel.EXPECTED.items())
        with patch.object(tunnel, 'run', return_value=SimpleNamespace(stdout=result)):
            tunnel.validate()
        for field in ('permitopen', 'allowstreamlocalforwarding', 'maxsessions', 'allowtcpforwarding', 'passwordauthentication'):
            values = dict(tunnel.EXPECTED)
            values[field] = 'unsafe'
            with self.subTest(field=field), patch.object(tunnel, 'run', return_value=SimpleNamespace(stdout='\n'.join(k+' '+v for k,v in values.items()))):
                with self.assertRaises(ValueError):
                    tunnel.validate()

    def scenario(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        state = root / 'state'
        state.mkdir()
        main = root / 'sshd_config'
        main.write_text('PasswordAuthentication no\nUsePAM yes\n')
        user = SimpleNamespace(pw_uid=2000, pw_gid=2000, pw_dir='/nonexistent', pw_shell='/usr/sbin/nologin')
        service = SimpleNamespace(pw_gid=1999)
        data = {'user': tunnel.USER, 'password': 'A' * 48}
        (state / 'account.json').write_text(json.dumps(data))
        (state / 'managed').write_text('1\n')
        for key, value in [('STATE', state), ('CONFIG', state/'sshd.conf'), ('MAIN', main), ('RUNTIME', root/'run')]:
            mock = patch.object(tunnel, key, value); mock.start(); self.addCleanup(mock.stop)
        for key, value in [('geteuid', lambda: 0), ('chown', lambda *a: None), ('fchown', lambda *a: None),
                           ('getgrouplist', lambda *a: [2000])]:
            mock = patch.object(tunnel.os, key, value); mock.start(); self.addCleanup(mock.stop)
        mock = patch.object(tunnel.pwd, 'getpwnam', side_effect=lambda name: service if name == tunnel.SERVICE_USER else user)
        mock.start(); self.addCleanup(mock.stop)
        return state, main, data

    def test_update_preserves_password_and_adds_policy_once(self):
        state, main, data = self.scenario()
        with patch.object(tunnel, 'validate'), patch.object(tunnel, 'run', return_value=SimpleNamespace(stdout='256 SHA256:fixture name')) as run:
            tunnel.install()
            tunnel.install()
        self.assertEqual(json.loads((state/'account.json').read_text())['password'], data['password'])
        self.assertEqual(main.read_text().count('Include '), 1)
        self.assertTrue(main.read_text().startswith('PasswordAuthentication no\nUsePAM yes\n'))
        self.assertEqual(sum(c.args == ('chpasswd',) for c in run.call_args_list), 1)
        self.assertEqual((state/'account.json').stat().st_mode & 0o777, 0o640)

    def test_invalid_existing_ssh_configuration_is_restored_without_unlocking_user(self):
        state, main, data = self.scenario()
        old = main.read_text()
        with patch.object(tunnel, 'validate', side_effect=ValueError('policy')), patch.object(tunnel, 'run') as run:
            with self.assertRaises(ValueError): tunnel.install()
        self.assertEqual(main.read_text(), old)
        self.assertFalse((state/'sshd.conf').exists())
        self.assertFalse((state/'ready').exists())
        self.assertFalse(any(c.args == ('chpasswd',) for c in run.call_args_list))

    def test_foreign_account_and_extra_groups_are_rejected(self):
        state, main, data = self.scenario()
        with patch.object(tunnel.os, 'getgrouplist', return_value=[2000, 27]), patch.object(tunnel, 'run') as run:
            with self.assertRaises(ValueError): tunnel.install()
            run.assert_not_called()
        (state/'managed').unlink()
        with patch.object(tunnel, 'run') as run:
            with self.assertRaises(ValueError): tunnel.install()
            run.assert_not_called()

    def test_missing_or_malformed_saved_credentials_never_change_the_password(self):
        state, main, data = self.scenario()
        (state/'ready').touch()
        (state/'account.json').unlink()
        with patch.object(tunnel, 'run') as run:
            with self.assertRaises(ValueError): tunnel.install()
            run.assert_not_called()
        (state/'account.json').write_text(json.dumps({'user':tunnel.USER,'password':'\n' * 48}))
        with patch.object(tunnel, 'run') as run:
            with self.assertRaises(ValueError): tunnel.install()
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
