import tempfile
import unittest
from pathlib import Path
from check_runtime import compare_files, extra_pipeline_files


class RuntimeCheckTests(unittest.TestCase):
    def test_equal_then_changed(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'source', Path(d)/'runtime'
            a.write_bytes(b'original'); b.write_bytes(b'original')
            self.assertEqual(compare_files([(a,b)]), [])
            b.write_bytes(b'modified')
            self.assertIn('Contenuto diverso', compare_files([(a,b)])[0])

    def test_missing_runtime_file(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d)/'source', Path(d)/'runtime'
            a.write_bytes(b'original')
            self.assertIn('File mancante', compare_files([(a,b)])[0])

    def test_unversioned_runtime_code_is_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); p=root/'pipeline'; p.mkdir()
            (p/'known.py').write_text('known'); (p/'extra.py').write_text('extra')
            (p/'__pycache__').mkdir(); (p/'__pycache__/cache.pyc').write_bytes(b'cache')
            self.assertEqual(extra_pipeline_files(root, [(root/'source', p/'known.py')]), [str(p/'extra.py')])


if __name__ == '__main__': unittest.main()
