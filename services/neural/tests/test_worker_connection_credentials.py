import secrets
from urllib.parse import quote

from app.database.worker_connection import connect_worker_database


class FakePg8000:
    def __init__(self):
        self.kwargs = None

    def connect(self, **kwargs):
        self.kwargs = kwargs
        return object()


def test_worker_dsn_percent_encoded_credentials_are_decoded_before_pg8000():
    pg8000 = FakePg8000()
    username = "agent@service"
    password = f"test:{secrets.token_hex(8)}/%"

    connect_worker_database(
        pg8000,
        f"postgresql://{quote(username, safe='')}:{quote(password, safe='')}@db.example.test:5432/glorifier",
        None,
        5.0,
    )

    assert pg8000.kwargs["user"] == username
    assert pg8000.kwargs["password"] == password
    assert pg8000.kwargs["database"] == "glorifier"
    assert pg8000.kwargs["host"] == "db.example.test"
    assert pg8000.kwargs["ssl_context"].verify_mode == __import__("ssl").CERT_REQUIRED
    assert pg8000.kwargs["ssl_context"].check_hostname is True
