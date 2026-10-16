"""Ingress body limit for the journal snapshot attachment boundary."""

from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

from starlette.responses import JSONResponse


SNAPSHOT_REQUEST_MAX_BYTES = 64 * 1024 + 4096
_SNAPSHOT_PATH = re.compile(r"^/api/v1/journal/[^/]+/snapshot$")


class SnapshotBodyTooLarge(Exception):
    """Raised while streaming an oversized snapshot body."""


class SnapshotBodyLimitMiddleware:
    """Reject oversized snapshot JSON before FastAPI materializes the body."""

    def __init__(self, app: Any, max_bytes: int = SNAPSHOT_REQUEST_MAX_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or not _SNAPSHOT_PATH.fullmatch(str(scope.get("path") or ""))
        ):
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        declared = headers.get("content-length")
        if declared is not None:
            try:
                declared_bytes = int(declared)
            except ValueError:
                await JSONResponse({"detail": "Invalid Content-Length header"}, status_code=400)(scope, receive, send)
                return
            if declared_bytes < 0:
                await JSONResponse({"detail": "Invalid Content-Length header"}, status_code=400)(scope, receive, send)
                return
            if declared_bytes > self.max_bytes:
                await JSONResponse({"detail": "Snapshot request is too large"}, status_code=413)(scope, receive, send)
                return

        received_bytes = 0
        response_started = False

        async def limited_receive() -> dict[str, Any]:
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body") or b"")
                if received_bytes > self.max_bytes:
                    raise SnapshotBodyTooLarge
            return message

        async def guarded_send(message: dict[str, Any]) -> None:
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except SnapshotBodyTooLarge:
            if response_started:
                raise
            await JSONResponse({"detail": "Snapshot request is too large"}, status_code=413)(scope, receive, send)
