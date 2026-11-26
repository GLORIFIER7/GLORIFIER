#!/usr/bin/env python3
"""GCEF phase 1: bounded public static-document inspection, local CLI only."""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import re
import socket
import ssl
import signal
from datetime import datetime, timezone
from urllib.parse import urlsplit, urljoin

MAX_BODY = 1_048_576
MAX_TEXT = 32_768
TIMEOUT = 8
HOST_RE = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z')

class PolicyError(Exception):
    """Fixed diagnostic category; never carries upstream content."""


def public_host(host):
    if not isinstance(host, str) or len(host) > 253 or '.' not in host:
        return False
    if not all(HOST_RE.fullmatch(label) for label in host.split('.')):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith('.'+s) for s in
                   ('localhost','local','internal','test','invalid','example','onion','home.arpa','localdomain'))


def validate_target(url, allowed_hosts):
    if not isinstance(url, str) or len(url) > 2048 or not url.isascii() or any(ord(c) <= 32 or ord(c) == 127 for c in url) or '\\' in url or '?' in url or '#' in url:
        raise PolicyError('TARGET_DENIED')
    try:
        target = urlsplit(url)
        host = target.hostname
        if (target.scheme != 'https' or target.username is not None or target.password is not None
                or target.port not in (None,443) or not public_host(host)
                or host not in allowed_hosts or target.netloc not in (host, host+':443')):
            raise PolicyError('TARGET_DENIED')
    except ValueError:
        raise PolicyError('TARGET_DENIED') from None
    return target


def safe_address(value):
    try:
        address=ipaddress.ip_address(value)
    except ValueError:
        return False
    return (address.is_global and not address.is_multicast and not address.is_reserved
            and not address.is_loopback and not address.is_link_local and not address.is_unspecified
            and not getattr(address,'ipv4_mapped',None))


def resolve_public(host, resolver=socket.getaddrinfo):
    try:
        records=resolver(host,443,type=socket.SOCK_STREAM)
        addresses=[record[4][0] for record in records]
    except (OSError, IndexError, TypeError):
        raise PolicyError('DNS_FAILED') from None
    if not addresses or any(not safe_address(ip) for ip in addresses):
        raise PolicyError('DNS_ADDRESS_DENIED')
    # Phase 1 connects only to a validated numeric IPv4 address. Do not resolve
    # the hostname a second time or use proxy environment variables.
    for ip in addresses:
        if ipaddress.ip_address(ip).version == 4:
            return ip
    raise PolicyError('IPV4_REQUIRED')


def tls_context():
    context=ssl.create_default_context()
    context.minimum_version=ssl.TLSVersion.TLSv1_2
    return context


def read_bounded_body(response):
    declared=response.getheader('Content-Length')
    transfer=response.getheader('Transfer-Encoding')
    if transfer is not None and (transfer.strip().lower()!='chunked' or declared is not None):
        raise PolicyError('BODY_FRAMING_DENIED')
    if declared is None and transfer is None:
        raise PolicyError('BODY_FRAMING_REQUIRED')
    if declared is not None and (not declared.isascii() or not declared.isdecimal() or len(declared)>10 or int(declared)>MAX_BODY):
        raise PolicyError('BODY_LIMIT')
    body=response.read(MAX_BODY+1)
    if len(body)>MAX_BODY:
        raise PolicyError('BODY_LIMIT')
    if declared is not None and len(body)!=int(declared):
        raise PolicyError('BODY_INCOMPLETE')
    return body


def fetch_pinned(target, address):
    if not safe_address(address) or ipaddress.ip_address(address).version != 4:
        raise PolicyError('DNS_ADDRESS_DENIED')
    context=tls_context()
    connection=http.client.HTTPConnection(target.hostname,443,timeout=TIMEOUT)
    # A numeric IPv4 socket is connected directly. TLS still validates the
    # original approved hostname; no certificate exception or redirect.
    try:
        with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as raw:
            raw.settimeout(TIMEOUT)
            raw.connect((address,443))
            with context.wrap_socket(raw,server_hostname=target.hostname) as tls:
                connection.sock=tls
                connection.request('GET',target.path or '/',headers={
                    'Host':target.hostname,'Accept':'text/html, text/plain',
                    'Accept-Encoding':'identity','Connection':'close',
                    'User-Agent':'GLORIFIER-GCEF/0.1 (public static inspection)',
                })
                with connection.getresponse() as response:
                    status=response.status
                    if status != 200:
                        raise PolicyError('HTTP_STATUS_'+str(status))
                    if response.getheader('Content-Encoding','identity').lower().strip() != 'identity':
                        raise PolicyError('CONTENT_ENCODING_DENIED')
                    content_type=response.getheader('Content-Type','').split(';',1)[0].strip().lower()
                    if content_type not in ('text/html','text/plain'):
                        raise PolicyError('CONTENT_TYPE_DENIED')
                    body=read_bounded_body(response)
                    return status,content_type,body
    except (OSError,ssl.SSLError,http.client.HTTPException):
        raise PolicyError('TRANSPORT_FAILED') from None
    finally:
        connection.close()


class StaticText(HTMLParser):
    OMIT={'script','style','iframe','noscript','template','object','svg','math'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.omitted=[]
        self.in_title=False
        self.title=[]
        self.text=[]
        self.links=[]
        self.links_truncated=False

    def handle_starttag(self,tag,attrs):
        if tag in self.OMIT:
            self.omitted.append(tag)
        elif not self.omitted and tag=='title':
            self.in_title=True
        elif not self.omitted and tag=='a':
            for key,value in attrs:
                if key=='href' and isinstance(value,str):
                    if len(self.links)<128:
                        self.links.append(value)
                    else:
                        self.links_truncated=True
                    break

    def handle_startendtag(self,tag,attrs):
        # HTML non-void omitted elements do not reliably self-close. Treat
        # them as open conservatively, including malformed script/style tags.
        if tag in ('svg','math'):
            return  # Foreign elements honor self-closing syntax.
        if tag in self.OMIT:
            self.handle_starttag(tag,attrs)
            if tag in self.CDATA_CONTENT_ELEMENTS:
                self.set_cdata_mode(tag)

    def handle_endtag(self,tag):
        if self.omitted:
            if self.omitted[-1]==tag:
                self.omitted.pop()
        elif tag=='title':
            self.in_title=False

    def handle_data(self,data):
        if not self.omitted:
            (self.title if self.in_title else self.text).append(data)


def extract_document(body,content_type):
    if len(body)>MAX_BODY:
        raise PolicyError('BODY_LIMIT')
    if content_type not in ('text/html','text/plain'):
        raise PolicyError('CONTENT_TYPE_DENIED')
    # Intentionally UTF-8 only; do not silently corrupt non-UTF-8 evidence.
    try:
        decoded=body.decode('utf-8','strict')
    except UnicodeError:
        raise PolicyError('UTF8_REQUIRED') from None
    if content_type=='text/html':
        parser=StaticText()
        parser.feed(decoded)
        parser.close()
        if parser.omitted:
            raise PolicyError('HTML_OMISSION_UNCLOSED')
        title=' '.join(' '.join(parser.title).split())
        text=' '.join(' '.join(parser.text).split())
    else:
        title=''
        text=decoded
    return {'title':title[:256],'text':text[:MAX_TEXT],
            'rawLinks':parser.links if content_type=='text/html' else [],
            'linksTruncated':parser.links_truncated if content_type=='text/html' else False,
            'textTruncated':len(text)>MAX_TEXT,'titleTruncated':len(title)>256}


def approved_links(base, raw_links, allowed_hosts):
    links=[]
    for raw in raw_links:
        if not isinstance(raw,str) or not raw or len(raw)>2048 or not raw.isascii() or any(ord(c)<=32 or ord(c)==127 for c in raw) or any(c in raw for c in ('\\','?','#')):
            continue
        try:
            url=validate_target(urljoin(base,raw),allowed_hosts).geturl()
        except (PolicyError,ValueError):
            continue
        if url not in links:
            links.append(url)
    return links


def inspect_page(url,allowed_hosts):
    target=validate_target(url,allowed_hosts)
    ip=resolve_public(target.hostname)
    status,content_type,body=fetch_pinned(target,ip)
    if status != 200:
        raise PolicyError('HTTP_STATUS_'+str(status))
    document=extract_document(body,content_type)
    raw_links=document.pop('rawLinks')
    links=approved_links(target.geturl(),raw_links,allowed_hosts)
    document['linksTruncated']=document['linksTruncated'] or len(links)>32
    return {'classification':'PUBLIC_STATIC_READ_ONLY','url':target.geturl(),
            'observedAt':datetime.now(timezone.utc).isoformat(),'status':status,
            'contentType':content_type,'bodyBytes':len(body),
            'bodySha256':hashlib.sha256(body).hexdigest(),'links':links[:32],**document}


def render_document(document):
    # Offline evidence view, not a screenshot of the original website.
    return ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
            '<style>body{margin:8px}h1,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{font:14px/1.4 monospace}</style>'
            '<title>GCEF static evidence</title></head><body><h1>'
            +html.escape(document['title'])+'</h1><pre>'+html.escape(document['text'])+'</pre></body></html>')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--allow-host',action='append',required=True,help='Explicit approved exact hostname; repeat to add another.')
    args=parser.parse_args()
    # The CLI is Linux-only. Bound slow reads and DNS work with a process-level
    # alarm in addition to socket timeouts. Use an external supervisor timeout
    # in production; library callers must supply their own deadline.
    def deadline(_signum,_frame):
        raise PolicyError('DEADLINE_EXCEEDED')
    previous=signal.signal(signal.SIGALRM,deadline)
    signal.alarm(20)
    try:
        result=inspect_page(args.url,set(args.allow_host))
        print(json.dumps(result,ensure_ascii=True))
    except PolicyError as exc:
        print(json.dumps({'classification':'FAILED_CLOSED','reason':str(exc)}))
        return 1
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM,previous)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
