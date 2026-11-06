import asyncio

from app.request_limits import RequestBodyLimitMiddleware


def test_streamed_body_over_limit_returns_413_without_content_length():
    messages = [
        {"type": "http.request", "body": b"1234", "more_body": True},
        {"type": "http.request", "body": b"5678", "more_body": False},
    ]
    responses = []

    async def receive():
        return messages.pop(0)

    async def send(message):
        responses.append(message)

    async def app(scope, receive, send):
        while True:
            message = await receive()
            if message["type"] == "http.request" and not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = RequestBodyLimitMiddleware(app, max_body_bytes=5)
    asyncio.run(middleware({"type": "http", "method": "POST"}, receive, send))

    assert responses[0]["status"] == 413
    assert b"5-byte limit" in responses[1]["body"]


def test_streamed_body_at_limit_reaches_application():
    messages = [
        {"type": "http.request", "body": b"123", "more_body": True},
        {"type": "http.request", "body": b"45", "more_body": False},
    ]
    responses = []

    async def receive():
        return messages.pop(0)

    async def send(message):
        responses.append(message)

    async def app(scope, receive, send):
        while True:
            message = await receive()
            if message["type"] == "http.request" and not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = RequestBodyLimitMiddleware(app, max_body_bytes=5)
    asyncio.run(middleware({"type": "http", "method": "POST"}, receive, send))

    assert responses[0]["status"] == 200
    assert responses[1]["body"] == b"ok"
