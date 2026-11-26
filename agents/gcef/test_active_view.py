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
