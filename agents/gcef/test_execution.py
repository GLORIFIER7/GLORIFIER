import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from execution import Ledger, Denied, approve_plan, execute_plan, receipt_digest

class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.clock=1000
        self.ledger=Ledger(Path(self.tmp.name)/'ledger.db', now=lambda:self.clock)
        self.plan={'url':'https://www.example.com/','hosts':['www.example.com']}
        self.worker,self.token=self.ledger.register(['www.example.com'])

    def test_plan_rejects_sensitive_and_unapproved_targets(self):
        for plan in [dict(self.plan, url='https://other.com/'),dict(self.plan, url='https://www.example.com/?token=x'),dict(self.plan, action='click'),dict(self.plan, hosts=['localhost'])]:
            with self.assertRaises(Denied): approve_plan(plan)

    def test_approval_and_claim_require_worker_identity(self):
        job=self.ledger.submit(self.plan)
        with self.assertRaises(Denied): self.ledger.claim(self.worker,'wrong')
        claim=self.ledger.claim(self.worker,self.token)
        self.assertEqual(claim['id'],job); self.assertEqual(claim['plan'],self.plan)
        self.assertIsNone(self.ledger.claim(self.worker,self.token))

    def test_expired_lease_rotates_and_rejects_old_receipt(self):
        job=self.ledger.submit(self.plan); first=self.ledger.claim(self.worker,self.token)
        self.clock+=46
        other,token=self.ledger.register(['www.example.com']); second=self.ledger.claim(other,token)
        self.assertEqual(second['id'],job); self.assertNotEqual(first['lease'],second['lease'])
        result={'status':'failed','reason':'INSPECTION_FAILED'}
        with self.assertRaises(Denied): self.ledger.finish(self.worker,self.token,job,first['lease'],result)
        self.ledger.finish(other,token,job,second['lease'],result)
        self.assertEqual(self.ledger.status(job)['state'],'failed')

    def test_revoked_worker_cannot_finish_or_claim(self):
        job=self.ledger.submit(self.plan); claim=self.ledger.claim(self.worker,self.token)
        self.ledger.revoke(self.worker)
        with self.assertRaises(Denied): self.ledger.claim(self.worker,self.token)
        with self.assertRaises(Denied): self.ledger.finish(self.worker,self.token,job,claim['lease'],{'status':'failed','reason':'INSPECTION_FAILED'})

    def test_completed_receipt_is_bound_to_target_and_immutable(self):
        job=self.ledger.submit(self.plan); claim=self.ledger.claim(self.worker,self.token)
        result={'status':'succeeded','receipt':{'classification':'PUBLIC_STATIC_READ_ONLY','url':self.plan['url'],'bodySha256':'a'*64,'status':200}}
        with self.assertRaises(Denied): self.ledger.finish(self.worker,self.token,job,claim['lease'],dict(result,receipt=dict(result['receipt'],url='https://other.com/')))
        self.ledger.finish(self.worker,self.token,job,claim['lease'],result)
        self.assertEqual(self.ledger.status(job)['digest'],receipt_digest(result))
        with self.assertRaises(Denied): self.ledger.finish(self.worker,self.token,job,claim['lease'],result)

    def test_durable_across_connections_and_expiry(self):
        job=self.ledger.submit(self.plan)
        reopened=Ledger(Path(self.tmp.name)/'ledger.db',now=lambda:self.clock)
        self.assertEqual(reopened.status(job)['state'],'approved')
        self.clock+=121
        self.assertIsNone(reopened.claim(self.worker,self.token))
        self.assertEqual(reopened.status(job)['state'],'expired')

    def test_executor_sanitizes_failure(self):
        with patch('execution.inspect_page',side_effect=RuntimeError('SECRET')):
            self.assertEqual(execute_plan(self.plan),{'status':'failed','reason':'INSPECTION_FAILED'})

    def test_claim_skips_incompatible_head(self):
        worker,token=self.ledger.register(['www.example.com'])
        other=self.ledger.submit({'url':'https://other.com/','hosts':['other.com']})
        self.clock+=1
        job=self.ledger.submit(self.plan)
        self.assertEqual(self.ledger.claim(worker,token)['id'],job)
        self.assertEqual(self.ledger.status(other)['state'],'approved')

    def test_maximum_receipt_survives_finish(self):
        job=self.ledger.submit(self.plan); claim=self.ledger.claim(self.worker,self.token)
        from gcef import inspect_page, MAX_TEXT
        body=('<title>'+'😀'*256+'</title><p>'+'😀'*MAX_TEXT+'</p>'+''.join('<a href="https://www.example.com/'+str(i)+'/'+('x'*2000)+'">x</a>' for i in range(32))).encode()
        with patch('gcef.resolve_public',return_value='93.184.216.34'), patch('gcef.fetch_pinned',return_value=(200,'text/html',body)):
            receipt=inspect_page(self.plan['url'],set(self.plan['hosts']))
        result={'status':'succeeded','receipt':receipt}
        from execution import canonical
        self.assertGreater(len(canonical(result)),262144)
        from worker_transport import MAX_REQUEST
        self.assertLessEqual(len(canonical({'worker':self.worker,'id':job,'lease':claim['lease'],'result':result})),MAX_REQUEST)
        self.ledger.finish(self.worker,self.token,job,claim['lease'],result)
        self.assertEqual(self.ledger.status(job)['digest'],receipt_digest(result))

    def test_legacy_workers_are_revoked_during_migration(self):
        import sqlite3
        from execution import token_hash
        path=Path(self.tmp.name)/'legacy.db'
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE workers (id TEXT PRIMARY KEY, digest TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)')
            db.execute('INSERT INTO workers VALUES (?,?,0)',('a'*32,token_hash('b'*43)))
        path.chmod(0o600)
        migrated=Ledger(path,now=lambda:self.clock)
        with self.assertRaises(Denied): migrated.claim('a'*32,'b'*43)
        worker,token=migrated.register(['www.example.com'])
        job=migrated.submit(self.plan)
        self.assertEqual(migrated.claim(worker,token)['id'],job)

    def test_registration_rejects_missing_or_unsafe_scope(self):
        for hosts in ([],['localhost'],['www.example.com']*2):
            with self.assertRaises(Denied): self.ledger.register(hosts)
