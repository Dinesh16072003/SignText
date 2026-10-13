SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
}

HSTS_HEADER = "max-age=63072000; includeSubDomains"


def _header_missing(headers, name):
    return not any(h[0].lower() == name.lower() for h in headers)


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        is_https = scope.get("scheme") == "https"

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", ()))
                for name, value in SECURITY_HEADERS.items():
                    if _header_missing(headers, name):
                        headers.append((name.encode("latin-1"), value.encode("latin-1")))
                if is_https and _header_missing(headers, "Strict-Transport-Security"):
                    headers.append((b"strict-transport-security", HSTS_HEADER.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)