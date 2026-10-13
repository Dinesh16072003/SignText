import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import (
    LOGIN_RATE_LIMIT,
    REFRESH_COOKIE,
    REFRESH_RATE_LIMIT,
    SIGNUP_RATE_LIMIT,
)
from app.models import AuthSession, User
from app.security.tokens import create_access_token, hash_refresh_token

EMAIL = "signer@example.com"
PASSWORD = "correct-horse-battery"


def signup(client, email=EMAIL, password=PASSWORD, display_name="Sam"):
    return client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "display_name": display_name},
    )


def login(client, email=EMAIL, password=PASSWORD):
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


def refresh(client):
    return client.post("/api/auth/refresh")


def logout(client):
    return client.post("/api/auth/logout")


def refresh_cookie(client):
    return client.cookies.get(REFRESH_COOKIE)


def replace_refresh_cookie(client, value):
    client.cookies.set(REFRESH_COOKIE, value, domain="testserver.local", path="/")


def session_for(client, db_session_factory):
    user_id = signup(client).json()["user"]["id"]
    with db_session_factory() as db:
        return db.scalar(
            select(AuthSession).where(AuthSession.user_id == uuid.UUID(user_id))
        )


def test_signup_hashes_password_never_plain_text(client, db_session_factory):
    response = signup(client)
    assert response.status_code == 201

    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))

    assert user is not None
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$argon2")


def test_signup_password_hash_is_argon2id(client, db_session_factory):
    signup(client)
    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
    assert "$argon2id$" in user.password_hash


def test_signup_rejects_password_shorter_than_eight(client):
    response = signup(client, password="short")
    assert response.status_code == 400
    assert response.json()["detail"] == "weak_password"


def test_signup_accepts_password_of_exactly_eight(client):
    response = signup(client, password="12345678")
    assert response.status_code == 201


def test_signup_rejects_invalid_email(client):
    response = signup(client, email="not-an-email")
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_signup_accepts_password_at_hard_max(client):
    response = signup(client, password="x" * 128)
    assert response.status_code == 201


def test_signup_rejects_password_over_hard_max(client):
    response = signup(client, password="x" * 129)
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_login_rejects_password_over_hard_max(client):
    response = login(client, password="x" * 129)
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_oversized_request_body_is_rejected_with_413(client):
    payload = {
        "email": "big@example.com",
        "password": "correct-horse-battery",
        "display_name": "x" * 30000,
    }
    response = client.post("/api/auth/signup", json=payload)
    assert response.status_code == 413
    assert response.json()["detail"] == "body_too_large"


def test_normal_sized_request_still_works_with_body_limit(client):
    response = signup(client)
    assert response.status_code == 201


def test_signup_rejects_duplicate_email(client):
    signup(client)
    response = signup(client)
    assert response.status_code == 409
    assert response.json()["detail"] == "user_already_exists"


def test_login_success_returns_short_lived_access_token(client):
    signup(client)
    response = login(client)
    assert response.status_code == 200

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert "refresh_token" not in body
    assert 0 < body["expires_in"] <= 60 * 30
    assert body["user"]["email"] == EMAIL
    assert body["user"]["user_metadata"]["display_name"] == "Sam"

    set_cookie = response.headers.get("set-cookie", "")
    assert f"{REFRESH_COOKIE}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie


def test_login_wrong_password_and_wrong_email_use_same_message(client):
    signup(client)

    wrong_password = login(client, password="wrong-password")
    wrong_email = login(client, email="nobody@example.com")

    assert wrong_password.status_code == 401
    assert wrong_email.status_code == 401
    assert wrong_password.json() == wrong_email.json()
    assert wrong_password.json()["detail"] == "invalid_credentials"


def test_me_requires_a_token(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_me_rejects_garbage_token(client):
    response = client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


def test_me_returns_current_user(client):
    token = signup(client).json()["access_token"]
    response = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


def test_me_rejects_expired_token(client):
    token = signup(client).json()["access_token"]
    user_id = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    ).json()["id"]

    expired, _ = create_access_token(uuid.UUID(user_id), timedelta(seconds=-5))
    response = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {expired}"}
    )
    assert response.status_code == 401


def test_logout_revokes_refresh_session(client, db_session_factory):
    refresh_token = refresh_cookie(signup(client))

    response = logout(client)
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    with db_session_factory() as db:
        session = db.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_refresh_token(refresh_token)
            )
        )
    assert session is not None
    assert session.revoked_at is not None


def test_logout_always_returns_ok_for_unknown_token(client):
    response = logout(client)
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_login_is_rate_limited_after_repeated_failures(client):
    signup(client)

    for _ in range(LOGIN_RATE_LIMIT):
        assert login(client, password="wrong-password").status_code == 401

    blocked = login(client, password="wrong-password")
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "over_request_rate_limit"


def test_successful_login_resets_failure_counter(client):
    signup(client)

    for _ in range(LOGIN_RATE_LIMIT - 1):
        assert login(client, password="wrong-password").status_code == 401

    assert login(client).status_code == 200
    assert login(client, password="wrong-password").status_code == 401


def test_signup_is_rate_limited_after_many_attempts(client):
    for i in range(SIGNUP_RATE_LIMIT):
        assert signup(client, email=f"user{i}@example.com").status_code == 201

    blocked = signup(client, email="another@example.com")
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "over_request_rate_limit"


def test_signup_rate_limit_counts_conflict_attempts(client):
    for i in range(SIGNUP_RATE_LIMIT):
        response = signup(client)
        if i == 0:
            assert response.status_code == 201
        else:
            assert response.status_code == 409

    blocked = signup(client, email="another@example.com")
    assert blocked.status_code == 429


def test_signup_hashes_password_even_when_email_taken(client, monkeypatch):
    import app.routers.auth as auth_module

    signup(client)
    calls = []

    def fake_hash(password):
        calls.append(password)
        return "$argon2id$fake-hash"

    monkeypatch.setattr(auth_module, "hash_password", fake_hash)

    response = signup(client)
    assert response.status_code == 409
    assert calls == [PASSWORD]


def test_refresh_is_rate_limited_after_repeated_failures(client):
    for _ in range(REFRESH_RATE_LIMIT):
        assert refresh(client).status_code == 401

    blocked = refresh(client)
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "over_request_rate_limit"


def test_refresh_rate_limit_blocks_even_a_valid_token_after_failures(client):
    for _ in range(REFRESH_RATE_LIMIT):
        refresh(client)

    replace_refresh_cookie(client, "a-valid-looking-refresh-token")
    blocked = refresh(client)
    assert blocked.status_code == 429


def test_responses_never_contain_password_or_hash(client, db_session_factory):
    response = signup(client)
    body = response.text
    assert PASSWORD not in body
    assert "password_hash" not in body
    assert "$argon2" not in body


def test_refresh_returns_new_access_and_refresh_tokens(client):
    old_token = refresh_cookie(signup(client))

    response = refresh(client)
    assert response.status_code == 200

    body = response.json()
    assert body["access_token"]
    assert "refresh_token" not in body
    assert body["token_type"] == "bearer"
    assert 0 < body["expires_in"] <= 60 * 30
    assert body["user"]["email"] == EMAIL
    assert refresh_cookie(client) is not None
    assert refresh_cookie(client) != old_token

    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == EMAIL


def test_refresh_rejects_expired_session(client, db_session_factory):
    session = session_for(client, db_session_factory)
    with db_session_factory() as db:
        stored = db.get(AuthSession, session.id)
        stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        db.commit()

    response = refresh(client)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_refresh_rejects_revoked_session(client, db_session_factory):
    session = session_for(client, db_session_factory)
    with db_session_factory() as db:
        stored = db.get(AuthSession, session.id)
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()

    response = refresh(client)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_refresh_rejects_unknown_token(client):
    response = refresh(client)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_old_refresh_token_fails_after_rotation(client):
    old_token = refresh_cookie(signup(client))

    rotated = refresh(client)
    assert rotated.status_code == 200

    replace_refresh_cookie(client, old_token)
    reused = refresh(client)
    assert reused.status_code == 401
    assert reused.json()["detail"] == "session_expired"


def test_reuse_of_old_token_revokes_whole_family(client):
    old_token = refresh_cookie(signup(client))

    assert refresh(client).status_code == 200
    new_token = refresh_cookie(client)

    replace_refresh_cookie(client, old_token)
    reused = refresh(client)
    assert reused.status_code == 401
    assert reused.json()["detail"] == "session_expired"

    replace_refresh_cookie(client, new_token)
    after_theft = refresh(client)
    assert after_theft.status_code == 401
    assert after_theft.json()["detail"] == "session_expired"


def test_logout_prevents_later_refresh(client):
    signup(client)

    assert logout(client).status_code == 200

    response = refresh(client)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_password_and_tokens_are_never_logged(client, caplog):
    with caplog.at_level("DEBUG"):
        response = signup(client)
        access_token = response.json()["access_token"]
        login(client)
        refresh(client)

    log_text = caplog.text
    assert PASSWORD not in log_text
    assert access_token not in log_text
    assert "$argon2" not in log_text
