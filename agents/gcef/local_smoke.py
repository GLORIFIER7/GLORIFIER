"""Optional real-dependency smoke: run unprivileged with Chromium, Playwright,
cryptography and openssl already installed. No external HTTP or real credentials.
"""
import os
from pathlib import Path
import ssl
import subprocess
import tempfile
import threading
from unittest.mock import patch
from active_view import ActiveView
from browser_view import configure_context
from execution import Ledger
from profile_vault import ProfileVault, VaultError
from worker_transport import TLSServer, call, run_worker_once, TransportDenied


def main():
    if os.geteuid()==0: raise SystemExit('UNPRIVILEGED_USER_REQUIRED')
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(path/'key.pem'),'-out',str(path/'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
        ledger=Ledger(path/'ledger.db'); worker,token=ledger.register()
        job=ledger.submit({'url':'https://www.example.com/','hosts':['www.example.com']})
        ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.minimum_version=ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(path/'cert.pem',path/'key.pem')
        with TLSServer(('127.0.0.1',0),ledger,ctx) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            origin=f'https://localhost:{server.server_port}'
            client=ssl.create_default_context(cafile=str(path/'cert.pem'));client.minimum_version=ssl.TLSVersion.TLSv1_2
            try:
                try: call(origin,'/claim',{'worker':worker},'x'*43,context=client)
                except TransportDenied: pass
                else: raise AssertionError('invalid token accepted')
                with patch('worker_transport.execute_plan',return_value={'status':'failed','reason':'INSPECTION_FAILED'}):
                    assert run_worker_once(origin,worker,token,allowed_hosts={'www.example.com'},context=client)=='failed'
                assert ledger.status(job)['state']=='failed'
                assert run_worker_once(origin,worker,token,allowed_hosts={'www.example.com'},context=client)=='idle'
            finally: server.shutdown();thread.join()
        print('TLS loopback claim/finish and invalid-token rejection: PASS (synthetic failure receipt)')
        clock=[100];vault=ProfileVault(path,os.urandom(32),now=lambda:clock[0]);origin='https://www.example.com'
        state={'cookies':[],'origins':[{'origin':origin,'localStorage':[{'name':'session','value':'SYNTHETIC_PRIVATE_VALUE'}]}]}
        profile=vault.save(state,origin,ttl=10); assert b'SYNTHETIC_PRIVATE_VALUE' not in (path/profile).read_bytes()
        assert vault.load(profile,origin)==state
        try: vault.load(profile,'https://other.com')
        except VaultError: pass
        else: raise AssertionError('scope bypass')
        clock[0]=111
        try: vault.load(profile,origin)
        except VaultError: pass
        else: raise AssertionError('expired state accepted')
        vault.revoke(profile); assert not (path/profile).exists()
        print('AES-GCM synthetic profile scope/expiry/revocation: PASS')
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,chromium_sandbox=True,executable_path='/usr/bin/chromium',timeout=10000)
        try:
            context=configure_context(browser)
            try:
                with ActiveView(context,{'title':'Synthetic evidence','text':'Fixture\n'*100}) as view:
                    view.run({'action':'fill','value':'local note only'})
                    assert view.run({'action':'read-note'})=='local note only'
                    view.run({'action':'scroll','direction':'bottom'})
                    assert view.run({'action':'screenshot'}).startswith(b'\x89PNG\r\n\x1a\n')
            finally: context.close()
        finally: browser.close()
    print('Sandboxed Chromium offline form entry, scrolling and screenshot: PASS')

if __name__=='__main__': main()
