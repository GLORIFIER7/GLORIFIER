import unittest
from profile_vault import validate_state, VaultError

class ProfileTests(unittest.TestCase):
    def test_state_scope_and_limits(self):
        origin='https://www.example.com'
        state={'cookies':[],'origins':[{'origin':origin,'localStorage':[{'name':'session','value':'private'}]}]}
        self.assertEqual(validate_state(state,origin),state)
        for invalid in [dict(state,origins=[{'origin':'https://other.com','localStorage':[]}]),dict(state,cookies=[{'domain':'.example.com'}]),dict(state,origins=[{'origin':origin,'localStorage':[{'name':'x','value':'x'*1000000}]}])]:
            with self.assertRaises(VaultError): validate_state(invalid,origin)
