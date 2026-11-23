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

    @unittest.skipUnless(os.name == 'posix', 'Malformed POSIX argument bytes')
    def test_malformed_utf8_is_rejected_before_persistence(self):
        # CLI memory records must be valid UTF-8 across every language binding.
        argv = [os.fsencode(str(EXE)), os.fsencode(str(self.db)), b'put',
                b'glorifier', b'malformed', b'\xff', b'contract-test']
        result = subprocess.run(argv, capture_output=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(self.run_memory('list', 'glorifier').stdout), [])

    def test_existing_malformed_database_text_still_emits_valid_json(self):
        # Old/imported databases can contain TEXT with invalid UTF-8 bytes.
        self.run_memory('seed')
        with sqlite3.connect(self.db) as conn:
            conn.execute("""INSERT INTO memory_v1(
                scope,memory_key,value,source,created_at,updated_at)
                VALUES('glorifier','legacy',CAST(X'FF' AS TEXT),'legacy',
                       '2026-11-23T00:00:00Z','2026-11-23T00:00:00Z')""")
        result = json.loads(self.run_memory('get', 'glorifier', 'legacy').stdout)
        self.assertEqual(result['value'], '\ufffd')
        self.assertTrue(json.loads(self.run_memory('list', 'glorifier').stdout))

    def test_backup_never_overwrites_existing_destination(self):
        self.run_memory('put', 's', 'a', 'contents', 'source')
        destination = Path(self.tmp.name) / 'sentinel.sqlite'
        destination.write_bytes(b'not a database: sentinel')
        self.assertNotEqual(self.run_memory('backup', str(destination), check=False).returncode, 0)
        self.assertEqual(destination.read_bytes(), b'not a database: sentinel')
        self.assertEqual(list(Path(self.tmp.name).glob('*.tmp*')), [])

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