class RequestBodyTooLarge(Exception):
    """Raised inside the receive loop when a request body exceeds the cap."""


class RequestBodySizeMiddleware:
    """Rejects request bodies larger than max_bytes with HTTP 413.

    FastAPI/Starlette has no built-in body size limit, so an attacker could
    otherwise stream an unbounded payload into memory. This middleware checks
    the Content-Length header up front for a fast rejection and also guards
    chunked (no Content-Length) bodies while they are being read.
    """

    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send(
            {"type": "http.response.body", "body": b'{"detail":"body_too_large"}'}
        )

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    continue
                if declared > self.max_bytes:
                    await self._reject(send)
                    return

        received = 0

        async def guarded_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, guarded_receive, send)
        except RequestBodyTooLarge:
            await self._reject(send)