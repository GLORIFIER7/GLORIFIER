import unittest
from active_view import validate_interaction, render_interactive, InteractionDenied

class ActiveTests(unittest.TestCase):
    def test_no_arbitrary_code_selectors_or_submission(self):
        for action in [{'action':'evaluate','script':'x'},{'action':'click','selector':'#x'},{'action':'submit'},{'action':'fill','value':'x'*513}]:
            with self.assertRaises(InteractionDenied): validate_interaction(action)
    def test_view_contains_only_escaped_evidence_and_local_controls(self):
        doc={'title':'<script>alert(1)</script>','text':'<img src=x>'}
        html=render_interactive(doc)
        self.assertNotIn('<script>alert(1)</script>',html)
        self.assertIn('id="gcef-note"',html)
        self.assertNotIn('<form',html)
        self.assertNotIn('src=x>',html.replace('&lt;img src=x&gt;',''))

    def test_scroll_targets_document_after_fill(self):
        from active_view import ActiveView
        from unittest.mock import MagicMock
        context=MagicMock()
        with ActiveView(context,{'title':'Fixture','text':'Long evidence'}) as view:
            view.run({'action':'fill','value':'note'})
            view.run({'action':'scroll','direction':'bottom'})
            view.page.evaluate.assert_called_once_with('window.scrollTo(0, document.scrollingElement.scrollHeight)')
            view.page.keyboard.press.assert_not_called()

    def test_action_budget_and_closed_session_fail_closed(self):
        from active_view import ActiveView
        from unittest.mock import MagicMock
        context=MagicMock()
        with ActiveView(context,{'title':'Fixture','text':'Evidence'}) as view:
            for _ in range(8):
                view.run({'action':'read-note'})
            with self.assertRaises(InteractionDenied):
                view.run({'action':'read-note'})
        self.assertEqual(view.page.locator.return_value.input_value.call_count,8)
        view.page.close.assert_called_once()
        with self.assertRaises(InteractionDenied):
            view.run({'action':'fill','value':'blocked'})
        view.page.locator.return_value.fill.assert_not_called()

    def test_fill_boundary_and_exact_action_shape(self):
        valid={'action':'fill','value':'x'*512}
        self.assertEqual(validate_interaction(valid),valid)
        for step in [None, {'action':'fill','value':512}, {'action':'fill','value':'x'*513}, {'action':'fill','value':'note','selector':'#other'}, {'action':'scroll','direction':'left'}, {'action':'read-note','extra':True}]:
            with self.subTest(step=step), self.assertRaises(InteractionDenied):
                validate_interaction(step)

    def test_denied_actions_exhaust_budget_without_browser_calls(self):
        from active_view import ActiveView
        from unittest.mock import MagicMock
        context=MagicMock()
        with ActiveView(context,{'title':'Fixture','text':'Evidence'}) as view:
            for _ in range(8):
                with self.assertRaises(InteractionDenied):
                    view.run({'action':'evaluate','script':'blocked'})
            with self.assertRaisesRegex(InteractionDenied,'SESSION_DENIED'):
                view.run({'action':'read-note'})
            view.page.evaluate.assert_not_called()
            view.page.locator.assert_not_called()

    def test_invalid_document_closes_allocated_page(self):
        from active_view import ActiveView
        from unittest.mock import MagicMock
        context=MagicMock()
        with self.assertRaises(InteractionDenied):
            ActiveView(context,{'title':'x'*257,'text':'Evidence'})
        context.new_page.return_value.close.assert_called_once()
        context.new_page.return_value.set_content.assert_not_called()
