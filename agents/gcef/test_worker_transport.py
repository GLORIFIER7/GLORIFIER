import unittest
from unittest.mock import patch
from worker_transport import dispatch, parse_endpoint, TransportDenied, run_worker_once

class TransportTests(unittest.TestCase):
    def test_endpoint_requires_https_origin(self):
        self.assertEqual(parse_endpoint('https://worker.example.com:8443'),'https://worker.example.com:8443')
        for bad in ['http://worker.example.com','https://user:pass@worker.example.com','https://worker.example.com/path','https://worker.example.com?x=1','https://worker.example.com#x','https://worker.example.com/']:
            with self.assertRaises(TransportDenied): parse_endpoint(bad)
    def test_no_owner_operations_over_transport(self):
        for path in ['/submit','/register','/status','/revoke','/claim?x=1']:
            with self.assertRaises(TransportDenied): dispatch(None,path,{},'Bearer '+'a'*43)
    def test_worker_payload_is_strict(self):
        for value in [{},{'worker':'a'*32,'token':'b'*43},{'worker':'bad'}]:
            with self.assertRaises(TransportDenied): dispatch(None,'/claim',value,'Bearer '+'a'*43)

    def test_worker_refuses_control_plane_scope_expansion(self):
        claim={'id':'a'*32,'lease':'b'*43,'expires':1000,'plan':{'url':'https://other.com/','hosts':['other.com']}}
        with patch('worker_transport.call',return_value={'claim':claim}), patch('worker_transport.execute_plan') as execute:
            with self.assertRaises(TransportDenied): run_worker_once('https://worker.example.com','c'*32,'d'*43,allowed_hosts={'www.example.com'})
            execute.assert_not_called()

    def test_stalled_handshake_does_not_block_valid_worker(self):
        import socket, ssl, subprocess, tempfile, threading, time
        from pathlib import Path
        from execution import Ledger
        from worker_transport import TLSServer, call
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)
            subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(path/'key.pem'),'-out',str(path/'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20)
            ledger=Ledger(path/'ledger.db'); worker,token=ledger.register(['www.example.com'])
            context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
            context.load_cert_chain(path/'cert.pem',path/'key.pem')
            client=ssl.create_default_context(cafile=str(path/'cert.pem'))
            with TLSServer(('127.0.0.1',0),ledger,context) as server:
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    with socket.create_connection(('127.0.0.1',server.server_port),timeout=2):
                        start=time.monotonic()
                        self.assertEqual(call(f'https://localhost:{server.server_port}','/claim',{'worker':worker},token,context=client),{'claim':None})
                        self.assertLess(time.monotonic()-start,3)
                        plan={'url':'https://www.example.com/','hosts':['www.example.com']}
                        job=ledger.submit(plan)
                        origin=f'https://localhost:{server.server_port}'
                        claim=call(origin,'/claim',{'worker':worker},token,context=client)['claim']
                        self.assertEqual(claim['id'],job)
                        result={'status':'succeeded','receipt':{'classification':'PUBLIC_STATIC_READ_ONLY','url':plan['url'],'bodySha256':'a'*64,'status':200,'title':'😀'*256,'text':'😀'*32768,'links':['https://www.example.com/'+str(i)+'/'+('x'*2000) for i in range(32)]}}
                        response=call(origin,'/finish',{'worker':worker,'id':job,'lease':claim['lease'],'result':result},token,context=client)
                        self.assertEqual(response,{'ok':True})
                        from execution import receipt_digest
                        self.assertEqual(ledger.status(job)['digest'],receipt_digest(result))
                finally: server.shutdown();thread.join()

    def test_unexpected_server_error_is_diagnosable_without_secrets(self):
        import io, contextlib, ssl
        from worker_transport import TLSServer
        with TLSServer(('127.0.0.1',0),None,ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)) as server:
            output=io.StringIO()
            with contextlib.redirect_stderr(output):
                try:
                    raise RuntimeError('SYNTHETIC_SECRET_BEARER')
                except RuntimeError:
                    server.handle_error('SYNTHETIC_REQUEST_SECRET',('SYNTHETIC_PEER_SECRET',0))
            self.assertIn('GCEF_UNEXPECTED_SERVER_ERROR',output.getvalue())
            self.assertRegex(output.getvalue(),r'line=[1-9][0-9]*')
            self.assertNotIn('SYNTHETIC_',output.getvalue())
