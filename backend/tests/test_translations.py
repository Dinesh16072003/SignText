import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import Translation, User
from app.security.tokens import create_access_token

PASSWORD = "correct-horse-battery"
EMAIL = "translator@example.com"

ENDPOINTS = [
    ("post", "/api/translations", {"json": {"text": "hello", "source": "live"}}),
    ("get", "/api/translations", {}),
    ("delete", f"/api/translations/{uuid.uuid4()}", {}),
]


def signup_user(client, email, display_name="Translator"):
    response = client.post(
        "/api/auth/signup",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert response.status_code == 201
    return response.json()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def create_translation(client, token, text="hello world", source="live"):
    return client.post(
        "/api/translations",
        json={"text": text, "source": source},
        headers=auth_headers(token),
    )


def set_created_at(db_session_factory, translation_id, when):
    with db_session_factory() as db:
        stored = db.get(Translation, uuid.UUID(translation_id))
        stored.created_at = when
        db.commit()


@pytest.mark.parametrize("method,url,kwargs", ENDPOINTS)
def test_endpoints_reject_missing_token(client, method, url, kwargs):
    response = getattr(client, method)(url, **kwargs)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


@pytest.mark.parametrize("method,url,kwargs", ENDPOINTS)
def test_endpoints_reject_malformed_token(client, method, url, kwargs):
    response = getattr(client, method)(
        url, headers=auth_headers("garbage"), **kwargs
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


@pytest.mark.parametrize("method,url,kwargs", ENDPOINTS)
def test_endpoints_reject_expired_token(client, method, url, kwargs):
    account = signup_user(client, "expired@example.com")
    me = client.get(
        "/api/auth/me", headers=auth_headers(account["access_token"])
    ).json()
    expired, _ = create_access_token(uuid.UUID(me["id"]), timedelta(seconds=-5))
    response = getattr(client, method)(url, headers=auth_headers(expired), **kwargs)
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


@pytest.mark.parametrize("method,url,kwargs", ENDPOINTS)
def test_endpoints_reject_revoked_token(client, db_session_factory, method, url, kwargs):
    account = signup_user(client, "revoked@example.com")
    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == "revoked@example.com"))
        user.is_active = False
        db.commit()
    response = getattr(client, method)(
        url, headers=auth_headers(account["access_token"]), **kwargs
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "session_expired"


def test_create_stores_trimmed_text_and_returns_record(client):
    account = signup_user(client, EMAIL)
    response = create_translation(
        client, account["access_token"], text="  hello there  "
    )
    assert response.status_code == 201
    body = response.json()
    assert body["text"] == "hello there"
    assert body["source"] == "live"
    assert uuid.UUID(body["id"])
    assert datetime.fromisoformat(body["created_at"]).tzinfo == timezone.utc


def test_create_ignores_spoofed_user_id_in_body(client, db_session_factory):
    account = signup_user(client, EMAIL)
    me = client.get(
        "/api/auth/me", headers=auth_headers(account["access_token"])
    ).json()

    response = client.post(
        "/api/translations",
        json={"text": "mine", "source": "live", "user_id": str(uuid.uuid4())},
        headers=auth_headers(account["access_token"]),
    )
    assert response.status_code == 201

    with db_session_factory() as db:
        translation = db.scalar(select(Translation).where(Translation.text == "mine"))
    assert str(translation.user_id) == me["id"]


def test_create_then_list_returns_newest_first_with_pagination_and_total(
    client, db_session_factory
):
    account = signup_user(client, EMAIL)
    headers = auth_headers(account["access_token"])

    first = create_translation(client, account["access_token"], text="first").json()
    second = create_translation(client, account["access_token"], text="second").json()
    third = create_translation(client, account["access_token"], text="third").json()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    set_created_at(db_session_factory, first["id"], now - timedelta(seconds=30))
    set_created_at(db_session_factory, second["id"], now - timedelta(seconds=20))
    set_created_at(db_session_factory, third["id"], now - timedelta(seconds=10))

    page_one = client.get("/api/translations?page=1&page_size=2", headers=headers)
    assert page_one.status_code == 200
    page_one_body = page_one.json()
    assert page_one_body["total"] == 3
    assert page_one_body["page"] == 1
    assert page_one_body["page_size"] == 2
    assert [t["text"] for t in page_one_body["translations"]] == ["third", "second"]

    page_two = client.get("/api/translations?page=2&page_size=2", headers=headers)
    assert page_two.status_code == 200
    page_two_body = page_two.json()
    assert page_two_body["total"] == 3
    assert page_two_body["page"] == 2
    assert [t["text"] for t in page_two_body["translations"]] == ["first"]
    assert page_two_body["translations"][0]["id"] == first["id"]


def test_list_rejects_large_page_size(client):
    account = signup_user(client, EMAIL)
    response = client.get(
        "/api/translations?page_size=101", headers=auth_headers(account["access_token"])
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_create_rejects_blank_and_whitespace_text(client):
    account = signup_user(client, EMAIL)
    for text in ["", "   ", "\t\n "]:
        response = create_translation(client, account["access_token"], text=text)
        assert response.status_code == 422
        assert response.json()["detail"] == "validation_failed"


def test_create_accepts_maximum_length_text_and_rejects_over(client):
    account = signup_user(client, EMAIL)
    ok = create_translation(client, account["access_token"], text="a" * 5000)
    assert ok.status_code == 201
    assert len(ok.json()["text"]) == 5000

    too_long = create_translation(client, account["access_token"], text="a" * 5001)
    assert too_long.status_code == 422
    assert too_long.json()["detail"] == "validation_failed"


def test_create_rejects_invalid_source(client):
    account = signup_user(client, EMAIL)
    response = create_translation(client, account["access_token"], source="captioned")
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_delete_rejects_invalid_uuid(client):
    account = signup_user(client, EMAIL)
    response = client.delete(
        "/api/translations/not-a-uuid",
        headers=auth_headers(account["access_token"]),
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "validation_failed"


def test_second_user_cannot_see_or_delete_first_users_translation(client):
    account_a = signup_user(client, "a@example.com")
    account_b = signup_user(client, "b@example.com")
    created = create_translation(
        client, account_a["access_token"], text="secret of A"
    ).json()

    b_list = client.get(
        "/api/translations", headers=auth_headers(account_b["access_token"])
    )
    assert b_list.status_code == 200
    assert b_list.json()["total"] == 0
    assert b_list.json()["translations"] == []

    b_delete = client.delete(
        f"/api/translations/{created['id']}",
        headers=auth_headers(account_b["access_token"]),
    )
    a_nonexistent = client.delete(
        f"/api/translations/{uuid.uuid4()}",
        headers=auth_headers(account_a["access_token"]),
    )
    assert b_delete.status_code == 404
    assert a_nonexistent.status_code == 404
    assert b_delete.json() == a_nonexistent.json()
    assert b_delete.json()["detail"] == "not_found"

    still_there = client.get(
        "/api/translations", headers=auth_headers(account_a["access_token"])
    )
    assert still_there.json()["total"] == 1


def test_delete_own_translation_then_second_delete_is_not_found(client):
    account = signup_user(client, EMAIL)
    created = create_translation(client, account["access_token"], text="mine").json()

    first = client.delete(
        f"/api/translations/{created['id']}",
        headers=auth_headers(account["access_token"]),
    )
    assert first.status_code == 200
    assert first.json() == {"ok": True}

    second = client.delete(
        f"/api/translations/{created['id']}",
        headers=auth_headers(account["access_token"]),
    )
    assert second.status_code == 404
    assert second.json()["detail"] == "not_found"


def test_translation_text_and_tokens_are_never_logged(client, caplog):
    secret_text = "VERY-SENSITIVE-SIGNAGE-987654"
    account = signup_user(client, EMAIL)
    token = account["access_token"]

    with caplog.at_level("DEBUG"):
        create_translation(client, token, text=secret_text)
        client.get("/api/translations", headers=auth_headers(token))
        client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})

    log_text = caplog.text
    assert secret_text not in log_text
    assert token not in log_text
    assert PASSWORD not in log_text
    assert "$argon2" not in log_text