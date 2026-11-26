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

    def test_full_page_capture_and_bounds(self):
        from browser_view import capture_view
        page=Mock()
        page.locator.return_value.bounding_box.return_value={'x':0,'y':0,'width':984,'height':2000}
        capture_view(page)
        page.screenshot.assert_called_once_with(timeout=5000,full_page=True,animations='disabled')
        page.reset_mock()
        page.locator.return_value.bounding_box.return_value={'x':0,'y':0,'width':984,'height':100000}
        with self.assertRaises(ValueError): capture_view(page)
        page.screenshot.assert_not_called()

    def test_document_wraps_long_text(self):
        from gcef import render_document
        source=render_document({'title':'Long','text':'x'*32768})
        self.assertIn('overflow-wrap:anywhere',source)
        self.assertIn('white-space:pre-wrap',source)
        self.assertIn('x'*32768,source)
