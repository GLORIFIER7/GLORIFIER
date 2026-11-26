"""Local owner-operated mission ledger. No public owner API or paid inference."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from gcef import inspect_page, validate_target, public_host, PolicyError, MAX_RECEIPT_BYTES

LEASE_SECONDS=45
TTL_SECONDS=120
# Worst-case ASCII JSON: 12 bytes per Unicode code point in title/text,
# 2 bytes per ASCII URL character, plus bounded metadata and envelope.
MAX_RESULT=MAX_RECEIPT_BYTES
ID_RE=re.compile(r'[0-9a-f]{32}\Z')
TOKEN_RE=re.compile(r'[A-Za-z0-9_-]{43}\Z')

class Denied(Exception):
    pass

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()

def receipt_digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

def validate_hosts(hosts):
    if not isinstance(hosts,list) or not 1<=len(hosts)<=8 or any(not public_host(h) for h in hosts) or len(set(hosts))!=len(hosts):
        raise Denied('HOST_SCOPE_DENIED')
    return sorted(hosts)

def approve_plan(plan):
    if not isinstance(plan,dict) or set(plan)!={'url','hosts'}:
        raise Denied('PLAN_DENIED')
    hosts=plan['hosts']
    if not isinstance(hosts,list) or not 1<=len(hosts)<=8 or any(not public_host(h) for h in hosts) or len(set(hosts))!=len(hosts):
        raise Denied('PLAN_DENIED')
    try: validate_target(plan['url'],set(hosts))
    except PolicyError: raise Denied('PLAN_DENIED') from None
    return {'url':plan['url'],'hosts':list(hosts)}

def token_hash(token):
    if not isinstance(token,str) or not TOKEN_RE.fullmatch(token): raise Denied('AUTH_DENIED')
    return hashlib.sha256(token.encode()).hexdigest()

def private_file(path):
    path=Path(path)
    parent=path.parent.stat()
    if parent.st_uid!=os.geteuid() or parent.st_mode & 0o077:
        raise Denied('PRIVATE_DIRECTORY_REQUIRED')
    fd=os.open(path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        import stat
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or st.st_mode & 0o077 or st.st_nlink!=1:
            raise Denied('PRIVATE_FILE_REQUIRED')
    finally: os.close(fd)
    return path

class Ledger:
    def __init__(self,path,*,now=time.time):
        self.path=private_file(path); self.now=now
        with self.tx() as db:
            db.execute("CREATE TABLE IF NOT EXISTS workers (id TEXT PRIMARY KEY, digest TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, hosts TEXT NOT NULL DEFAULT '[]')")
            db.execute('''CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, plan TEXT NOT NULL, state TEXT NOT NULL,
                created REAL NOT NULL, expires REAL NOT NULL, worker TEXT, lease TEXT, until REAL, result TEXT, digest TEXT)''')
            # Legacy registrations had no trusted scope. Revoke them rather
            # than guessing their authorization; owners must re-enroll.
            if 'hosts' not in {row['name'] for row in db.execute('PRAGMA table_info(workers)')}:
                db.execute("ALTER TABLE workers ADD COLUMN hosts TEXT NOT NULL DEFAULT '[]'")
                db.execute('UPDATE workers SET revoked=1')
                self._sweep(db,self.now())
                db.execute("UPDATE jobs SET state='approved',worker=NULL,lease=NULL,until=NULL WHERE state='claimed'")
    @contextmanager
    def tx(self):
        db=sqlite3.connect(self.path,timeout=5,isolation_level=None)
        db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE'); yield db; db.commit()
        except BaseException:
            db.rollback(); raise
        finally: db.close()
    def _auth(self,db,worker,token):
        digest=token_hash(token)
        row=db.execute('SELECT digest,revoked,hosts FROM workers WHERE id=?',(worker,)).fetchone()
        if not row or row['revoked'] or not hmac.compare_digest(row['digest'],digest): raise Denied('AUTH_DENIED')
        return set(validate_hosts(json.loads(row['hosts'])))
    def _sweep(self,db,now):
        db.execute("UPDATE jobs SET state='expired',lease=NULL,worker=NULL,until=NULL WHERE state IN ('approved','claimed') AND expires<=?",(now,))
        db.execute("UPDATE jobs SET state='approved',lease=NULL,worker=NULL,until=NULL WHERE state='claimed' AND until<=?",(now,))
    def register(self,hosts):
        hosts=validate_hosts(hosts)
        worker=secrets.token_hex(16); token=secrets.token_urlsafe(32)
        with self.tx() as db: db.execute('INSERT INTO workers(id,digest,hosts) VALUES (?,?,?)',(worker,token_hash(token),canonical(hosts).decode()))
        return worker,token
    def revoke(self,worker):
        with self.tx() as db:
            db.execute('UPDATE workers SET revoked=1 WHERE id=?',(worker,))
            self._sweep(db,self.now())
            db.execute("UPDATE jobs SET state='approved',worker=NULL,lease=NULL,until=NULL WHERE worker=? AND state='claimed'",(worker,))
    def submit(self,plan):
        plan=approve_plan(plan); job=secrets.token_hex(16); now=self.now()
        with self.tx() as db:
            db.execute('INSERT INTO jobs(id,plan,state,created,expires) VALUES (?,?,?,?,?)',(job,canonical(plan).decode(),'approved',now,now+TTL_SECONDS))
        return job
    def claim(self,worker,token):
        with self.tx() as db:
            scope=self._auth(db,worker,token); now=self.now(); self._sweep(db,now)
            if db.execute("SELECT 1 FROM jobs WHERE worker=? AND state='claimed'",(worker,)).fetchone(): return None
            row=next((candidate for candidate in db.execute("SELECT id,plan,expires FROM jobs WHERE state='approved' ORDER BY created,id")
                      if set(json.loads(candidate['plan'])['hosts']).issubset(scope)),None)
            if not row: return None
            lease=secrets.token_urlsafe(32); until=min(row['expires'],now+LEASE_SECONDS)
            db.execute("UPDATE jobs SET state='claimed',worker=?,lease=?,until=? WHERE id=?",(worker,token_hash(lease),until,row['id']))
            return {'id':row['id'],'plan':json.loads(row['plan']),'lease':lease,'expires':until}
    def finish(self,worker,token,job,lease,result):
        with self.tx() as db:
            self._auth(db,worker,token); now=self.now(); self._sweep(db,now)
            row=db.execute('SELECT * FROM jobs WHERE id=?',(job,)).fetchone()
            if not row or row['state']!='claimed' or row['worker']!=worker or not hmac.compare_digest(row['lease'],token_hash(lease)): raise Denied('LEASE_DENIED')
            if not isinstance(result,dict): raise Denied('RESULT_DENIED')
            if result=={'status':'failed','reason':'INSPECTION_FAILED'}: pass
            elif set(result)=={'status','receipt'} and result['status']=='succeeded' and isinstance(result['receipt'],dict):
                receipt=result['receipt']
                if receipt.get('url')!=json.loads(row['plan'])['url'] or receipt.get('classification')!='PUBLIC_STATIC_READ_ONLY' or receipt.get('status')!=200 or not isinstance(receipt.get('bodySha256'),str) or not re.fullmatch('[0-9a-f]{64}',receipt['bodySha256']): raise Denied('RESULT_DENIED')
            else: raise Denied('RESULT_DENIED')
            try: encoded=canonical(result)
            except (ValueError,TypeError,RecursionError): raise Denied('RESULT_DENIED') from None
            if len(encoded)>MAX_RESULT: raise Denied('RESULT_DENIED')
            db.execute('UPDATE jobs SET state=?,result=?,digest=?,lease=NULL,until=NULL WHERE id=?',(result['status'],encoded.decode(),hashlib.sha256(encoded).hexdigest(),job))
    def status(self,job):
        with self.tx() as db:
            self._sweep(db,self.now()); row=db.execute('SELECT id,state,result,digest FROM jobs WHERE id=?',(job,)).fetchone()
            return dict(row) if row else None

def execute_plan(plan):
    try:
        approved=approve_plan(plan)
        return {'status':'succeeded','receipt':inspect_page(approved['url'],set(approved['hosts']))}
    except Exception: # fixed public category, never raw exception or response
        return {'status':'failed','reason':'INSPECTION_FAILED'}
