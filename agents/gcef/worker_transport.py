"""TLS worker-only pull transport; owner administration is local filesystem access."""
import argparse
import http.client
import json
import os
import re
import signal
import ssl
import socket
import sys
import threading
from socketserver import ThreadingMixIn
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from execution import Ledger, Denied, ID_RE, TOKEN_RE, MAX_RESULT, execute_plan, private_file, approve_plan, canonical
from gcef import tls_context, public_host

MAX_REQUEST=MAX_RESULT+4096
MAX_CONNECTIONS=8
CONNECTION_DEADLINE=10
class TransportDenied(Exception): pass

def parse_endpoint(origin):
    try:
        p=urlsplit(origin)
        if not isinstance(origin,str) or not origin.isascii() or any(ord(c)<=32 or ord(c)==127 for c in origin) or '\\' in origin or p.scheme!='https' or not p.hostname or p.username is not None or p.password is not None or p.path or '?' in origin or '#' in origin or p.netloc not in (p.hostname,p.hostname+':'+str(p.port)) or p.port==0: raise ValueError()
        return origin
    except (ValueError,TypeError,AttributeError): raise TransportDenied('ENDPOINT_DENIED') from None

def dispatch(ledger,path,payload,auth):
    if path not in ('/claim','/finish') or not isinstance(auth,str) or not auth.startswith('Bearer ') or not TOKEN_RE.fullmatch(auth[7:]) or not isinstance(payload,dict) or not isinstance(payload.get('worker'),str) or not ID_RE.fullmatch(payload['worker']): raise TransportDenied('REQUEST_DENIED')
    token=auth[7:]; worker=payload['worker']
    if path=='/claim' and set(payload)=={'worker'}: return {'claim':ledger.claim(worker,token)}
    if path=='/finish' and set(payload)=={'worker','id','lease','result'} and isinstance(payload['id'],str) and ID_RE.fullmatch(payload['id']):
        ledger.finish(worker,token,payload['id'],payload['lease'],payload['result']); return {'ok':True}
    raise TransportDenied('REQUEST_DENIED')

def report_server_error():
    # Report only a trusted module label and numeric traceback location.
    # Never include exception text, request contents, peer address or locals.
    trace=sys.exc_info()[2]
    line=0
    module='external'
    while trace is not None:
        name=trace.tb_frame.f_globals.get('__name__')
        if name in ('worker_transport', '__main__', 'execution', 'gcef'):
            module='worker_transport' if name=='__main__' else name
            line=trace.tb_lineno
        elif line==0:
            line=trace.tb_lineno
        trace=trace.tb_next
    print(f'GCEF_UNEXPECTED_SERVER_ERROR module={module} line={line}',file=sys.stderr,flush=True)


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(5); super().setup()
    def log_message(self,*_): pass
    def send_json(self,status,data):
        payload=json.dumps(data,ensure_ascii=True,allow_nan=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
    def do_POST(self):
        try:
            sizes=self.headers.get_all('Content-Length',[])
            auth=self.headers.get_all('Authorization',[])
            if self.headers.get('Transfer-Encoding') is not None or len(sizes)!=1 or not re.fullmatch('[0-9]{1,7}',sizes[0]) or not 0<int(sizes[0])<=MAX_REQUEST or len(auth)!=1 or self.headers.get('Content-Type')!='application/json': raise TransportDenied('REQUEST_DENIED')
            raw=self.rfile.read(int(sizes[0]))
            if len(raw)!=int(sizes[0]): raise TransportDenied('REQUEST_DENIED')
            result=dispatch(self.server.ledger,self.path,json.loads(raw),auth[0])
        except (Denied,TransportDenied,ValueError,TypeError,RecursionError,OSError):
            self.send_json(403,{'error':'REQUEST_DENIED'}); return
        except Exception:
            report_server_error()
            self.send_json(503,{'error':'SERVICE_UNAVAILABLE'}); return
        self.send_json(200,result)
    def send_error(self,code,message=None,explain=None): self.send_json(code,{'error':'REQUEST_DENIED'})

def terminate_connection(sock):
    try: sock.shutdown(socket.SHUT_RDWR)
    except OSError: pass

class TLSServer(ThreadingMixIn,HTTPServer):
    # Limit unauthenticated peers before starting a thread or TLS handshake.
    # This is a private-network availability guard, not public DoS protection.
    daemon_threads=False
    def __init__(self,address,ledger,context):
        self.ledger=ledger; self.context=context
        self.slots=threading.BoundedSemaphore(MAX_CONNECTIONS)
        super().__init__(address,Handler)
    def process_request(self,sock,address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(sock); return
        try: super().process_request(sock,address)
        except BaseException:
            self.slots.release(); raise
    def process_request_thread(self,sock,address):
        tls=None; timer=None
        try:
            sock.settimeout(5)
            tls=self.context.wrap_socket(sock,server_side=True,do_handshake_on_connect=False)
            timer=threading.Timer(CONNECTION_DEADLINE,terminate_connection,args=(tls,))
            timer.daemon=True; timer.start()
            try:
                tls.do_handshake()
            except (OSError,ValueError):
                return  # Expected peer or TLS negotiation failure.
            try:
                self.finish_request(tls,address)
            except (ConnectionError,TimeoutError,ssl.SSLError):
                return  # Expected connection failure.
        except Exception: self.handle_error(sock,address)
        finally:
            if timer is not None: timer.cancel(); timer.join()
            self.shutdown_request(tls if tls is not None else sock)
            self.slots.release()
    def handle_error(self,request,client_address):
        report_server_error()

def call(origin,path,payload,token,*,context=None):
    p=urlsplit(parse_endpoint(origin)); context=context or tls_context()
    connection=http.client.HTTPSConnection(p.hostname,p.port or 443,timeout=8,context=context)
    try:
        raw=canonical(payload)
        if len(raw)>MAX_REQUEST: raise TransportDenied('REQUEST_DENIED')
        connection.request('POST',path,body=raw,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Connection':'close'})
        with connection.getresponse() as response:
            if response.status!=200: raise TransportDenied('REMOTE_DENIED')
            body=response.read(MAX_REQUEST+1)
            if len(body)>MAX_REQUEST: raise TransportDenied('RESPONSE_LIMIT')
            return json.loads(body)
    finally: connection.close()

def run_worker_once(origin,worker,token,*,allowed_hosts,context=None):
    if not allowed_hosts or any(not public_host(host) for host in allowed_hosts): raise TransportDenied('WORKER_SCOPE_DENIED')
    claim=call(origin,'/claim',{'worker':worker},token,context=context)['claim']
    if claim is None: return 'idle'
    if not isinstance(claim,dict) or set(claim)!={'id','plan','lease','expires'} or not isinstance(claim['id'],str) or not ID_RE.fullmatch(claim['id']) or not isinstance(claim['lease'],str) or not TOKEN_RE.fullmatch(claim['lease']): raise TransportDenied('CLAIM_DENIED')
    plan=approve_plan(claim['plan'])
    if not set(plan['hosts']).issubset(allowed_hosts): raise TransportDenied('WORKER_SCOPE_DENIED')
    result=execute_plan(plan)
    response=call(origin,'/finish',{'worker':worker,'id':claim['id'],'lease':claim['lease'],'result':result},token,context=context)
    if response!={'ok':True}: raise TransportDenied('RESULT_UNCONFIRMED')
    return result['status']

def read_private(path):
    path=private_file(path)
    with path.open('rb') as f: raw=f.read(32769)
    if len(raw)>32768: raise TransportDenied('FILE_LIMIT')
    return json.loads(raw)

def write_new(path,value):
    path=Path(path); st=path.parent.stat()
    if st.st_uid!=os.geteuid() or st.st_mode&0o077: raise TransportDenied('PRIVATE_DIRECTORY_REQUIRED')
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as f: json.dump(value,f)

def main():
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='action',required=True)
    for name in ('register','submit','status','revoke','serve'):
        p=sub.add_parser(name); p.add_argument('db',type=Path)
        if name=='register':
            p.add_argument('credential',type=Path); p.add_argument('--allow-host',required=True,action='append')
        if name=='submit': p.add_argument('plan',type=Path)
        if name in ('status','revoke'): p.add_argument('id')
        if name=='serve':
            p.add_argument('--cert',required=True); p.add_argument('--key',required=True); p.add_argument('--bind',default='127.0.0.1'); p.add_argument('--port',type=int,default=8443)
    p=sub.add_parser('worker'); p.add_argument('origin'); p.add_argument('credential',type=Path); p.add_argument('--ca-file'); p.add_argument('--allow-host',required=True,action='append')
    args=parser.parse_args()
    try:
        if os.geteuid()==0: raise TransportDenied('UNPRIVILEGED_USER_REQUIRED')
        if args.action=='worker':
            state=read_private(args.credential); context=ssl.create_default_context(cafile=args.ca_file); context.minimum_version=ssl.TLSVersion.TLSv1_2
            def deadline(*_): raise SystemExit(1)
            signal.signal(signal.SIGALRM,deadline); signal.alarm(40)
            print(json.dumps({'state':run_worker_once(args.origin,state['worker'],state['token'],allowed_hosts=set(args.allow_host),context=context)})); return 0
        ledger=Ledger(args.db)
        if args.action=='register':
            worker,token=ledger.register(args.allow_host)
            try: write_new(args.credential,{'worker':worker,'token':token})
            except BaseException: ledger.revoke(worker); raise
            print(json.dumps({'worker':worker})); return 0
        if args.action=='submit': print(json.dumps({'id':ledger.submit(read_private(args.plan))})); return 0
        if args.action=='status': print(json.dumps(ledger.status(args.id))); return 0
        if args.action=='revoke': ledger.revoke(args.id); return 0
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.minimum_version=ssl.TLSVersion.TLSv1_2; context.load_cert_chain(args.cert,args.key)
        with TLSServer((args.bind,args.port),ledger,context) as server: server.serve_forever()
    except Exception: print(json.dumps({'error':'EXECUTION_FAILED'})); return 1
    return 0

if __name__=='__main__': raise SystemExit(main())
