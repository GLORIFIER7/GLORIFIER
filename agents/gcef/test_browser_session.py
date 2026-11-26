import unittest
from unittest.mock import Mock
from gcef import PolicyError
from browser_session import BrowserSession, approved_links, validate_plan, render_session

HOST='example.com'
URL='https://example.com/page'

class SessionTests(unittest.TestCase):
    def test_links_are_only_explicit_approved_https_paths(self):
        links=approved_links(URL,['/next','https://evil.com/','//example.com/path','/q?token=x','/next','javascript:bad()','#fragment'],{HOST})
        self.assertEqual(links,['https://example.com/next','https://example.com/path'])

    def test_plan_is_strictly_bounded(self):
        for plan in [[],[{'action':'navigate','url':URL}]*9,[{'action':'execute','code':'x'}],[{'action':'follow','index':True}],[{'action':'screenshot','path':'/tmp/x'}],[{'action':'navigate','url':URL,'token':'x'}]]:
            with self.subTest(plan=plan), self.assertRaises(PolicyError): validate_plan(plan)
        self.assertEqual(validate_plan([{'action':'navigate','url':URL}])[0]['url'],URL)

    def test_session_uses_sanitized_offline_view_and_pinned_inspector(self):
        page=Mock(); context=Mock(); context.new_page.return_value=page
        inspect=Mock(side_effect=lambda url,hosts: {'classification':'PUBLIC_STATIC_READ_ONLY','url':url,'title':'<script>bad</script>','text':'hello','links':['https://example.com/next']})
        with BrowserSession(context,{HOST},inspector=inspect) as session:
            session.navigate(URL)
            self.assertIn('&lt;script&gt;',page.set_content.call_args.args[0]); page.goto.assert_not_called()
            session.follow(0)
            page.locator.assert_called_with('#gcef-link-0')
            self.assertEqual(inspect.call_args.args[0],'https://example.com/next')
            with self.assertRaises(PolicyError): session.follow(2)
            with self.assertRaises(PolicyError): session.navigate('https://evil.com/')
        page.close.assert_called_once()
        with self.assertRaises(PolicyError): session.navigate(URL)

    def test_failed_navigation_invalidates_previous_links(self):
        context=Mock(); inspect=Mock(side_effect=[{'classification':'PUBLIC_STATIC_READ_ONLY','url':URL,'title':'ok','text':'ok','links':['https://example.com/next']},PolicyError('DNS_FAILED')])
        with BrowserSession(context,{HOST},inspector=inspect) as session:
            session.navigate(URL)
            with self.assertRaises(PolicyError): session.follow(0)
            with self.assertRaises(PolicyError): session.follow(0)

    def test_render_has_no_remote_href(self):
        rendered=render_session({'title':'<script>','text':'<img src=x>'},['https://example.com/next'])
        self.assertNotIn('href="https:',rendered)
        self.assertNotIn('<img',rendered)
        self.assertIn('id="gcef-link-0"',rendered)
