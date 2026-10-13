import uuid
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    Uuid,
    create_engine,
    select,
    text,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.rate_limit import login_rate_limiter
from app.security.passwords import hash_password
from app.security.tokens import generate_refresh_token, hash_refresh_token
from migrations.runner import run_migrations

LEGACY_EMAIL = "legacy@example.com"

# A faithful copy of the schema as it existed before B3: users shaped like the
# current model, sessions WITHOUT family_id.
legacy_meta = MetaData()

legacy_users = Table(
    "users",
    legacy_meta,
    Column("id", Uuid(as_uuid=True), primary_key=True),
    Column("email", String(320), unique=True, index=True),
    Column("password_hash", String(255)),
    Column("display_name", String(120)),
    Column("email_verified_at", DateTime(timezone=True), nullable=True),
    Column("is_active", Boolean),
    Column("created_at", DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
)

legacy_sessions = Table(
    "sessions",
    legacy_meta,
    Column("id", Uuid(as_uuid=True), primary_key=True),
    Column("user_id", Uuid(as_uuid=True), index=True),
    Column("token_hash", String(255), index=True),
    Column("expires_at", DateTime(timezone=True)),
    Column("revoked_at", DateTime(timezone=True), nullable=True),
    Column("user_agent", String(255), nullable=True),
    Column("created_at", DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
)


def _make_client(engine):
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    login_rate_limiter.clear()
    return TestClient(app)


def _sessions_columns(connection):
    rows = connection.execute(text("PRAGMA table_info(sessions)")).fetchall()
    return {row[1]: {"type": row[2], "notnull": row[3]} for row in rows}


def test_migrations_upgrade_legacy_database_and_auth_still_works():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    legacy_meta.create_all(engine)

    legacy_user_id = uuid.uuid4()
    legacy_refresh_token = generate_refresh_token()
    legacy_token_hash = hash_refresh_token(legacy_refresh_token)
    far_future = datetime.now(timezone.utc) + timedelta(days=30)

    with engine.begin() as connection:
        connection.execute(
            legacy_users.insert().values(
                id=legacy_user_id,
                email=LEGACY_EMAIL,
                password_hash=hash_password("legacy-password-long-enough"),
                display_name="Legacy",
                is_active=True,
            )
        )
        connection.execute(
            legacy_sessions.insert().values(
                id=uuid.uuid4(),
                user_id=legacy_user_id,
                token_hash=legacy_token_hash,
                expires_at=far_future,
            )
        )

    applied = run_migrations(engine)
    assert applied == [1]

    applied_again = run_migrations(engine)
    assert applied_again == []

    with engine.connect() as connection:
        columns = _sessions_columns(connection)
        assert "family_id" in columns
        assert columns["family_id"]["notnull"] == 1
        index_names = {
            row[1] for row in connection.execute(text("PRAGMA index_list(sessions)"))
        }
        assert "ix_sessions_family_id" in index_names
        assert "ix_sessions_user_id" in index_names
        assert "ix_sessions_token_hash" in index_names

        legacy_row = connection.execute(
            text("SELECT id, family_id FROM sessions WHERE token_hash = :t"),
            {"t": legacy_token_hash},
        ).fetchone()
        assert legacy_row is not None
        assert legacy_row.family_id == legacy_row.id

        versions = connection.execute(
            text("SELECT COUNT(*), MIN(version), MAX(version) FROM schema_migrations")
        ).fetchone()
        assert versions == (1, 1, 1)

    client = _make_client(engine)

    with client:
        signup_response = client.post(
            "/api/auth/signup",
            json={
                "email": "new@example.com",
                "password": "super-secret-123",
                "display_name": "New",
            },
        )
        assert signup_response.status_code == 201

        legacy_refresh_response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": legacy_refresh_token},
        )
        assert legacy_refresh_response.status_code == 200
        legacy_rotated = legacy_refresh_response.json()
        assert legacy_rotated["user"]["email"] == LEGACY_EMAIL

        login_response = client.post(
            "/api/auth/login",
            json={"email": "new@example.com", "password": "super-secret-123"},
        )
        assert login_response.status_code == 200
        logged_in = login_response.json()

        me_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {logged_in['access_token']}"},
        )
        assert me_response.status_code == 200
        assert me_response.json()["email"] == "new@example.com"

        refresh_response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": logged_in["refresh_token"]},
        )
        assert refresh_response.status_code == 200
        assert refresh_response.json()["access_token"] != logged_in["access_token"]

        logout_response = client.post(
            "/api/auth/logout",
            json={"refresh_token": logged_in["refresh_token"]},
        )
        assert logout_response.status_code == 200
        assert logout_response.json() == {"ok": True}

    with engine.connect() as connection:
        old_family = connection.execute(
            text("SELECT family_id FROM sessions WHERE token_hash = :t"),
            {"t": legacy_token_hash},
        ).fetchone()[0]
        new_family = connection.execute(
            text("SELECT family_id FROM sessions WHERE token_hash = :t"),
            {"t": hash_refresh_token(legacy_rotated["refresh_token"])},
        ).fetchone()[0]
        assert old_family == new_family == legacy_row.id

    app.dependency_overrides.clear()
    login_rate_limiter.clear()
    engine.dispose()