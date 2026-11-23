"""Black-box regression tests for the GLORIFIER C durable memory store."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

EXE = Path(__file__).resolve().parents[1] / 'glorifier-memory'


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'memory.sqlite'

    def run_memory(self, *args, db=None, check=True):
        return subprocess.run([str(EXE), str(db or self.db), *args],
                              text=True, capture_output=True, check=check)

    def test_survives_process_restart_and_preserves_provenance(self):
        self.run_memory('put', 'glorifier', 'mission', 'Governed AI', 'README.md')
        record = json.loads(self.run_memory('get', 'glorifier', 'mission').stdout)
        self.assertEqual(record['value'], 'Governed AI')
        self.assertEqual(record['source'], 'README.md')
        self.assertEqual(record['scope'], 'glorifier')
        self.assertEqual(record['key'], 'mission')
        self.assertTrue(record['created_at'].endswith('Z'))
        self.assertTrue(record['updated_at'].endswith('Z'))
        self.assertEqual(self.run_memory('integrity').stdout.strip(), 'ok')
        self.assertEqual(sqlite3.connect(self.db).execute('select count(*) from memory_v1').fetchone()[0], 1)

    def test_scope_isolation_and_update(self):
        self.run_memory('put', 'alpha', 'goal', 'one', 'human')
        self.run_memory('put', 'beta', 'goal', 'two', 'human')
        self.run_memory('put', 'alpha', 'goal', 'revised', 'new-source')
        self.assertEqual(json.loads(self.run_memory('get', 'alpha', 'goal').stdout)['value'], 'revised')
        self.assertEqual(json.loads(self.run_memory('get', 'alpha', 'goal').stdout)['source'], 'new-source')
        self.assertEqual(json.loads(self.run_memory('get', 'beta', 'goal').stdout)['value'], 'two')
        listed = json.loads(self.run_memory('list', 'alpha').stdout)
        self.assertEqual([x['key'] for x in listed], ['goal'])

    def test_untrusted_strings_are_data_and_json_is_valid(self):
        key = "a' OR 1=1 --"
        value = 'quoted "value"\\ newline\n tab\t and unicode ☯'
        self.run_memory('put', 'glorifier', key, value, 'test-source')
        self.assertEqual(json.loads(self.run_memory('get', 'glorifier', key).stdout)['value'], value)
        self.assertEqual(len(json.loads(self.run_memory('list', 'glorifier').stdout)), 1)
        self.assertEqual(self.run_memory('get', 'glorifier', 'absent', check=False).returncode, 3)

    def test_delete_and_backup(self):
        self.run_memory('put', 's', 'a', 'contents', 'source')
        backup = Path(self.tmp.name) / 'backup.sqlite'
        self.run_memory('backup', str(backup))
        self.assertEqual(json.loads(self.run_memory('get', 's', 'a', db=backup).stdout)['value'], 'contents')
        self.assertEqual(self.run_memory('backup', str(backup), check=False).returncode, 1)
        self.run_memory('delete', 's', 'a')
        self.assertEqual(self.run_memory('get', 's', 'a', check=False).returncode, 3)
        self.assertEqual(json.loads(self.run_memory('list', 's').stdout), [])

    def test_seed_records_glorifier_identity_with_provenance(self):
        self.run_memory('seed')
        identity = json.loads(self.run_memory('get', 'glorifier', 'identity').stdout)
        self.assertEqual(identity['value'], 'The governed intelligence layer for AI-powered businesses.')
        self.assertEqual(identity['source'], 'README.md')
        self.assertEqual(len(json.loads(self.run_memory('list', 'glorifier').stdout)), 3)
        self.run_memory('put', 'glorifier', 'identity', 'Customized identity', 'owner')
        self.run_memory('seed')  # idempotent; does not overwrite the owner
        self.assertEqual(len(json.loads(self.run_memory('list', 'glorifier').stdout)), 3)
        self.assertEqual(json.loads(self.run_memory('get', 'glorifier', 'identity').stdout)['value'], 'Customized identity')

    def test_invalid_inputs_rejected(self):
        self.assertNotEqual(self.run_memory('put', '', 'key', 'value', 'source', check=False).returncode, 0)
        self.assertNotEqual(self.run_memory('put', 's', '', 'value', 'source', check=False).returncode, 0)
        self.assertNotEqual(self.run_memory('put', 's', 'key', '', 'source', check=False).returncode, 0)
        self.assertNotEqual(self.run_memory('put', 's', 'key', 'value', '', check=False).returncode, 0)
        self.assertNotEqual(self.run_memory('put', 's', 'key', 'x' * 65537, 'source', check=False).returncode, 0)
        self.assertNotEqual(self.run_memory('unknown', check=False).returncode, 0)

    @unittest.skipUnless(os.name == 'posix', 'POSIX file permissions only')
    def test_private_database_permissions(self):
        self.run_memory('put', 's', 'a', 'v', 'source')
        self.assertEqual(self.db.stat().st_mode & 0o077, 0)


if __name__ == '__main__':
    unittest.main()
