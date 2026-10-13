import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import LOGIN_RATE_LIMIT
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


def refresh(client, refresh_token):
    return client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )


def session_for(db_session_factory, refresh_token):
    with db_session_factory() as db:
        return db.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_refresh_token(refresh_token)
            )
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
    assert body["refresh_token"]
    assert 0 < body["expires_in"] <= 60 * 30
    assert body["user"]["email"] == EMAIL
    assert body["user"]["user_metadata"]["display_name"] == "Sam"


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
    refresh_token = signup(client).json()["refresh_token"]

    response = client.post("/api/auth/logout", json={"refresh_token": refresh_token})
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
    response = client.post("/api/auth/logout", json={"refresh_token": "unknown"})
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


def test_responses_never_contain_password_or_hash(client, db_session_factory):
    response = signup(client)
    body = response.text
    assert PASSWORD not in body
    assert "password_hash" not in body
    assert "$argon2" not in body


def test_refresh_returns_new_access_and_refresh_tokens(client):
    tokens = signup(client).json()

    response = refresh(client, tokens["refresh_token"])
    assert response.status_code == 200

    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["refresh_token"] != tokens["refresh_token"]
    assert body["token_type"] == "bearer"
    assert 0 < body["expires_in"] <= 60 * 30
    assert body["user"]["email"] == EMAIL

    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == EMAIL


def test_refresh_rejects_expired_session(client, db_session_factory):
    tokens = signup(client).json()
    session = session_for(db_session_factory, tokens["refresh_token"])
    with db_session_factory() as db:
        stored = db.get(AuthSession, session.id)
        stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        db.commit()

    response = refresh(client, tokens["refresh_token"])
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_refresh_rejects_revoked_session(client, db_session_factory):
    tokens = signup(client).json()
    session = session_for(db_session_factory, tokens["refresh_token"])
    with db_session_factory() as db:
        stored = db.get(AuthSession, session.id)
        stored.revoked_at = datetime.now(timezone.utc)
        db.commit()

    response = refresh(client, tokens["refresh_token"])
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_refresh_rejects_unknown_token(client):
    response = refresh(client, "not-a-real-refresh-token")
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_old_refresh_token_fails_after_rotation(client):
    tokens = signup(client).json()
    old_token = tokens["refresh_token"]

    rotated = refresh(client, old_token)
    assert rotated.status_code == 200

    reused = refresh(client, old_token)
    assert reused.status_code == 401
    assert reused.json()["detail"] == "session_expired"


def test_reuse_of_old_token_revokes_whole_family(client):
    tokens = signup(client).json()
    old_token = tokens["refresh_token"]

    new_token = refresh(client, old_token).json()["refresh_token"]

    reused = refresh(client, old_token)
    assert reused.status_code == 401
    assert reused.json()["detail"] == "session_expired"

    after_theft = refresh(client, new_token)
    assert after_theft.status_code == 401
    assert after_theft.json()["detail"] == "session_expired"


def test_logout_prevents_later_refresh(client):
    tokens = signup(client).json()
    refresh_token = tokens["refresh_token"]

    assert (
        client.post(
            "/api/auth/logout", json={"refresh_token": refresh_token}
        ).status_code
        == 200
    )

    response = refresh(client, refresh_token)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_password_and_tokens_are_never_logged(client, caplog):
    with caplog.at_level("DEBUG"):
        response = signup(client)
        access_token = response.json()["access_token"]
        refresh_token = response.json()["refresh_token"]
        login(client)
        refresh(client, refresh_token)

    log_text = caplog.text
    assert PASSWORD not in log_text
    assert access_token not in log_text
    assert refresh_token not in log_text
    assert "$argon2" not in log_text
