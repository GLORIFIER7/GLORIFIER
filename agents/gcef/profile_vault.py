"""Owner-local encrypted profile-state storage. Never expose a decrypt API to agents."""
import json
import os
import re
import secrets
import time
from pathlib import Path
from gcef import public_host

MAX_STATE=262144
MAX_TTL=3600
class VaultError(Exception): pass

def validate_state(state,origin):
    if not isinstance(origin,str) or not origin.startswith('https://') or not public_host(origin[8:]): raise VaultError('SCOPE_DENIED')
    if not isinstance(state,dict) or set(state)!={'cookies','origins'} or not isinstance(state['cookies'],list) or not isinstance(state['origins'],list): raise VaultError('STATE_DENIED')
    if len(state['cookies'])>128 or len(state['origins'])>1: raise VaultError('STATE_DENIED')
    for c in state['cookies']:
        if not isinstance(c,dict) or set(c)!={'name','value','domain','path','expires','httpOnly','secure','sameSite'} or c['domain']!=origin[8:] or c['secure'] is not True or c['httpOnly'] is not True or not all(isinstance(c[k],str) for k in ('name','value','path')) or not c['path'].startswith('/') or c['sameSite'] not in ('Strict','Lax','None') or type(c['expires']) not in (int,float): raise VaultError('COOKIE_DENIED')
    for entry in state['origins']:
        if not isinstance(entry,dict) or set(entry)!={'origin','localStorage'} or entry['origin']!=origin or not isinstance(entry['localStorage'],list) or len(entry['localStorage'])>128: raise VaultError('SCOPE_DENIED')
        for item in entry['localStorage']:
            if not isinstance(item,dict) or set(item)!={'name','value'} or not all(isinstance(v,str) for v in item.values()): raise VaultError('STATE_DENIED')
    try: data=json.dumps(state,ensure_ascii=True,allow_nan=False).encode()
    except (ValueError,TypeError): raise VaultError('STATE_DENIED') from None
    if len(data)>MAX_STATE: raise VaultError('STATE_LIMIT')
    return state

class ProfileVault:
    def __init__(self,directory,key,*,now=time.time):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        self.dir=Path(directory); st=self.dir.stat()
        if st.st_uid!=os.geteuid() or st.st_mode & 0o077 or not self.dir.is_dir(): raise VaultError('PRIVATE_DIRECTORY_REQUIRED')
        if not isinstance(key,bytes) or len(key)!=32: raise VaultError('KEY_DENIED')
        self.aead=AESGCM(key); self.now=now
    def _path(self,profile):
        if not isinstance(profile,str) or not re.fullmatch('[0-9a-f]{32}',profile): raise VaultError('PROFILE_DENIED')
        return self.dir/profile
    def _aad(self,profile,origin): return ('GCEF-profile-v1\0'+profile+'\0'+origin).encode()
    def save(self,state,origin,ttl=900):
        validate_state(state,origin)
        if type(ttl) is not int or not 1<=ttl<=MAX_TTL: raise VaultError('TTL_DENIED')
        profile=secrets.token_hex(16); nonce=secrets.token_bytes(12)
        payload=json.dumps({'expires':self.now()+ttl,'state':state},ensure_ascii=True,allow_nan=False).encode()
        data=nonce+self.aead.encrypt(nonce,payload,self._aad(profile,origin))
        fd=os.open(self._path(profile),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f: f.write(data)
        return profile
    def load(self,profile,origin):
        try:
            fd=os.open(self._path(profile),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            with os.fdopen(fd,'rb') as f:
                import stat
                st=os.fstat(f.fileno())
                if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.geteuid() or st.st_mode & 0o077: raise VaultError('FILE_DENIED')
                data=f.read(MAX_STATE+1024)
            payload=json.loads(self.aead.decrypt(data[:12],data[12:],self._aad(profile,origin)))
            if self.now()>=payload['expires']: raise VaultError('EXPIRED')
            return validate_state(payload['state'],origin)
        except Exception: raise VaultError('PROFILE_UNAVAILABLE') from None
    def revoke(self,profile): self._path(profile).unlink(missing_ok=True)
