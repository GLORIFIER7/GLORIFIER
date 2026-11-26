import ipaddress
import unittest
from unittest.mock import patch
from gcef import (PolicyError, validate_target, resolve_public, extract_document,
                  inspect_page, render_document, MAX_BODY)

HOST = 'example.com'
URL = 'https://example.com/page'

class GcefTests(unittest.TestCase):
    def test_exact_https_host(self):
        self.assertEqual(validate_target(URL, {HOST}).hostname, HOST)

    def test_reject_unsafe_targets(self):
        for url in ['http://example.com', 'https://example.com.evil.net',
                    'https://example.com@evil.net', 'https://user@example.com',
                    'https://example.com:444', 'https://127.0.0.1',
                    'https://example.com/a?token=secret', 'https://example.com/#x',
                    'https://example.com/a\\b', 'https://example.com/a\n']:
            with self.subTest(url=url), self.assertRaises(PolicyError):
                validate_target(url, {HOST, '127.0.0.1'})

    def test_resolver_rejects_mixed_private_and_public(self):
        for private in ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','224.0.0.1','100.64.0.1']:
            with self.subTest(private=private), self.assertRaises(PolicyError):
                resolve_public(HOST, resolver=lambda *a, **k: [(0,0,0,'',('8.8.8.8',443)),(0,0,0,'',(private,443))])

    def test_public_dns_address(self):
        self.assertEqual(resolve_public(HOST,resolver=lambda *a,**k:[(0,0,0,'',('8.8.8.8',443))]), '8.8.8.8')

    def test_no_active_html(self):
        doc=extract_document(b'<title>Demo</title><p>Hello &amp; world</p><script>secret_script()</script><style>secret_css</style><iframe>secret_frame</iframe>', 'text/html')
        self.assertEqual(doc['title'],'Demo')
        self.assertIn('Hello & world',doc['text'])
        self.assertNotIn('secret_',doc['text'])

    def test_self_closing_omitted_tags(self):
        for tag in ('script','style','iframe','template'):
            with self.subTest(tag=tag):
                body=f'<p>before</p><{tag}/>hidden<{"/"+tag}><p>after</p>'.encode()
                self.assertEqual(extract_document(body,'text/html')['text'],'before after')

    def test_tls_floor(self):
        import ssl
        from gcef import tls_context
        ctx=tls_context()
        self.assertGreaterEqual(ctx.minimum_version,ssl.TLSVersion.TLSv1_2)
        self.assertTrue(ctx.check_hostname)
        self.assertEqual(ctx.verify_mode,ssl.CERT_REQUIRED)

    def test_render_escapes_untrusted_data(self):
        rendered=render_document({'title':'<script>bad</script>','text':'<img src=x onerror=bad()>'})
        self.assertNotIn('<script>',rendered)
        self.assertNotIn('<img',rendered)
        self.assertIn('&lt;img',rendered)
        self.assertIn("default-src 'none'",rendered)

    def test_receipt_real_payload_digest(self):
        import hashlib
        payload=b'<title>Example</title><p>Text</p>'
        with patch('gcef.resolve_public',return_value='8.8.8.8'), patch('gcef.fetch_pinned',return_value=(200,'text/html',payload)) as fetch:
            result=inspect_page(URL,{HOST})
        fetch.assert_called_once()
        self.assertEqual(fetch.call_args.args[1],'8.8.8.8')
        self.assertEqual(result['bodySha256'],hashlib.sha256(payload).hexdigest())
        self.assertEqual(result['classification'],'PUBLIC_STATIC_READ_ONLY')
        self.assertEqual(result['status'],200)

    def test_never_follow_redirects(self):
        with patch('gcef.resolve_public',return_value='8.8.8.8'), patch('gcef.fetch_pinned',return_value=(302,'text/html',b'')):
            with self.assertRaises(PolicyError): inspect_page(URL,{HOST})

    def test_never_parse_nontext(self):
        with self.assertRaises(PolicyError): extract_document(b'abc','application/octet-stream')

    def test_body_bound(self):
        with self.assertRaises(PolicyError): extract_document(b'a'*(MAX_BODY+1),'text/plain')

    def test_reject_before_any_network(self):
        with patch('gcef.resolve_public') as resolve:
            with self.assertRaises(PolicyError): inspect_page('https://bad.example', {HOST})
            resolve.assert_not_called()


class EvidenceIntegrityTests(unittest.TestCase):
    def test_foreign_self_closing_elements_preserve_text(self):
        for tag in ('svg','math'):
            with self.subTest(tag=tag):
                doc=extract_document(f'<p>before</p><{tag}/><p>after</p>'.encode(),'text/html')
                self.assertEqual(doc['text'],'before after')
        self.assertEqual(extract_document(b'<svg><svg/>hidden</svg>after','text/html')['text'],'after')

    def test_unclosed_omission_fails_closed(self):
        with self.assertRaisesRegex(PolicyError,'HTML_OMISSION_UNCLOSED'):
            extract_document(b'before<script/>hidden','text/html')

    def test_links_are_filtered_in_receipt(self):
        body=b'<a href="/next">next</a><script><a href="/hidden">hidden</a></script><a href="https://evil.com/">external</a>'
        with patch('gcef.resolve_public',return_value='8.8.8.8'), patch('gcef.fetch_pinned',return_value=(200,'text/html',body)):
            receipt=inspect_page(URL,{HOST})
        self.assertEqual(receipt['links'],['https://example.com/next'])
        self.assertNotIn('rawLinks',receipt)

    def test_body_framing(self):
        from gcef import read_bounded_body
        from unittest.mock import Mock
        for headers,body,expected in [({'Content-Length':'5'},b'ab','BODY_INCOMPLETE'),
                                      ({'Content-Length':'1','Transfer-Encoding':'chunked'},b'a','BODY_FRAMING_DENIED'),
                                      ({'Transfer-Encoding':'gzip'},b'a','BODY_FRAMING_DENIED'),
                                      ({},b'a','BODY_FRAMING_REQUIRED')]:
            response=Mock(); response.getheader.side_effect=lambda name,default=None: headers.get(name,default)
            response.read.return_value=body
            with self.subTest(headers=headers),self.assertRaisesRegex(PolicyError,expected):
                read_bounded_body(response)
        response=Mock(); response.getheader.side_effect=lambda name,default=None: {'Content-Length':'3'}.get(name,default)
        response.read.return_value=b'abc'
        self.assertEqual(read_bounded_body(response),b'abc')

if __name__=='__main__': unittest.main()
