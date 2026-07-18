import asyncio
import json

from app.middleware.snapshot_body_limit import SnapshotBodyLimitMiddleware


def _scope(*, path: str, content_length: int | None = None) -> dict:
    headers = [] if content_length is None else [(b"content-length", str(content_length).encode())]
    return {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": headers,
    }


async def _invoke(scope: dict, chunks: list[bytes], *, max_bytes: int = 16) -> tuple[list[dict], bool]:
    messages = [
        {
            "type": "http.request",
            "body": chunk,
            "more_body": index < len(chunks) - 1,
        }
        for index, chunk in enumerate(chunks)
    ]
    downstream_called = False
    sent = []

    async def receive():
        return messages.pop(0)

    async def send(message):
        sent.append(message)

    async def downstream(_scope, downstream_receive, downstream_send):
        nonlocal downstream_called
        downstream_called = True
        while True:
            message = await downstream_receive()
            if message.get("more_body") is not True:
                break
        await downstream_send({"type": "http.response.start", "status": 204, "headers": []})
        await downstream_send({"type": "http.response.body", "body": b""})

    middleware = SnapshotBodyLimitMiddleware(downstream, max_bytes=max_bytes)
    await middleware(scope, receive, send)
    return sent, downstream_called


def _response(sent: list[dict]) -> tuple[int, dict]:
    status = next(message["status"] for message in sent if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return status, json.loads(body) if body else {}


def test_snapshot_ingress_rejects_declared_oversize_before_downstream_parsing():
    sent, called = asyncio.run(_invoke(
        _scope(path="/api/v1/journal/journal-1/snapshot", content_length=17),
        [b"{}"],
    ))

    assert _response(sent) == (413, {"detail": "Snapshot request is too large"})
    assert called is False


def test_snapshot_ingress_counts_chunked_bodies_without_content_length():
    sent, called = asyncio.run(_invoke(
        _scope(path="/api/v1/journal/journal-1/snapshot"),
        [b"1234567890", b"1234567"],
    ))

    assert _response(sent) == (413, {"detail": "Snapshot request is too large"})
    assert called is True


def test_snapshot_ingress_leaves_other_routes_and_bounded_requests_unchanged():
    bounded, bounded_called = asyncio.run(_invoke(
        _scope(path="/api/v1/journal/journal-1/snapshot", content_length=2),
        [b"{}"],
    ))
    other, other_called = asyncio.run(_invoke(
        _scope(path="/api/v1/journal"),
        [b"12345678901234567"],
    ))

    assert _response(bounded)[0] == 204
    assert bounded_called is True
    assert _response(other)[0] == 204
    assert other_called is True
