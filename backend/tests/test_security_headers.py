from fastapi.testclient import TestClient

from app.main import app


def test_security_headers_are_present_over_http(client):
    response = client.get("/api/health")
    assert response.status_code == 200

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "no-referrer"
    assert response.headers.get("permissions-policy")
    assert "Strict-Transport-Security" not in response.headers


def test_security_headers_present_on_error_responses(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"


def test_hsts_is_sent_over_https():
    with TestClient(app, base_url="https://testserver") as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers.get("strict-transport-security") == "max-age=63072000; includeSubDomains"