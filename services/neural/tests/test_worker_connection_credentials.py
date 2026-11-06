from app.database.worker_connection import connect_worker_database


class FakePg8000:
    def __init__(self):
        self.kwargs = None

    def connect(self, **kwargs):
        self.kwargs = kwargs
        return object()


def test_worker_dsn_percent_encoded_credentials_are_decoded_before_pg8000():
    pg8000 = FakePg8000()

    connect_worker_database(
        pg8000,
        "postgresql://agent%40service:p%3Ass%2Fword%25@db.example.test:5432/glorifier",
        None,
        5.0,
    )

    assert pg8000.kwargs["user"] == "agent@service"
    assert pg8000.kwargs["password"] == "p:ss/word%"
    assert pg8000.kwargs["database"] == "glorifier"
    assert pg8000.kwargs["host"] == "db.example.test"
