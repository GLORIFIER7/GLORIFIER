import unittest
from unittest.mock import Mock
from browser_view import configure_context, prepare_view

class BrowserViewTests(unittest.TestCase):
    def test_context_is_offline_and_active_content_disabled(self):
        browser=Mock()
        context=configure_context(browser)
        browser.new_context.assert_called_once_with(offline=True, java_script_enabled=False,
            service_workers='block', accept_downloads=False, viewport={'width': 1000,'height': 720})
        self.assertIs(context,browser.new_context.return_value)
        context.route.assert_called_once()
        route=Mock()
        context.route.call_args.args[1](route)
        route.abort.assert_called_once()

    def test_browser_view_receives_only_escaped_static_document(self):
        context=Mock()
        page=prepare_view(context, {'title':'<script>alert(1)</script>','text':'<img src=https://external.example/a>'})
        self.assertIs(page,context.new_page.return_value)
        source=page.set_content.call_args.args[0]
        self.assertIn('&lt;script&gt;',source)
        self.assertNotIn('<img',source)
        self.assertNotIn('<script>',source)
        page.goto.assert_not_called()
