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
