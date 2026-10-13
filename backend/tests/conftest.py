import os

os.environ.setdefault("SIGNTEXT_SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("SIGNTEXT_ACCESS_TOKEN_MINUTES", "30")
os.environ.setdefault("SIGNTEXT_LOGIN_RATE_LIMIT", "5")
os.environ.setdefault("SIGNTEXT_LOGIN_RATE_WINDOW_SECONDS", "60")
os.environ.setdefault("SIGNTEXT_MAX_BODY_BYTES", "20000")
os.environ.setdefault("SIGNTEXT_RUN_MIGRATIONS", "0")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base
from app.rate_limit import login_rate_limiter


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture()
def db_session_factory(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client(db_engine, db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    login_rate_limiter.clear()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    login_rate_limiter.clear()
