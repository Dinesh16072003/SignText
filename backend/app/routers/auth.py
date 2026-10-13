from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import (
    COOKIE_SECURE,
    PASSWORD_MIN_LENGTH,
    REFRESH_COOKIE,
    REFRESH_COOKIE_MAX_AGE,
)
from app.db import get_db
from app.models import AuthSession, User
from app.rate_limit import (
    login_rate_limiter,
    refresh_rate_limiter,
    signup_rate_limiter,
)
from app.schemas.auth import (
    LoginRequest,
    SignUpRequest,
    SignUpResponse,
    TokenResponse,
    UserOut,
)
from app.security.deps import SESSION_ERROR, get_current_user
from app.security.denylist import deny_access_token
from app.security.passwords import DUMMY_HASH, hash_password, verify_password
from app.security.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_expires_at,
)

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_TYPE = "bearer"


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _cookie_secure(request: Request) -> bool:
    if COOKIE_SECURE == "1":
        return True
    if COOKIE_SECURE == "0":
        return False
    return request.url.scheme == "https"


def _set_refresh_cookie(
    response: Response, request: Request, refresh_token: str
) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        expires=refresh_expires_at(),
        path="/",
        secure=_cookie_secure(request),
        httponly=True,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path="/")


def _cleared_cookie_header(request: Request) -> dict[str, str]:
    secure = "; Secure" if _cookie_secure(request) else ""
    return {
        "set-cookie": (
            f"{REFRESH_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax{secure}"
        )
    }


def _read_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE)


def _deny_presented_access_token(request: Request) -> None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token:
        deny_access_token(token)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _find_session(db: Session, refresh_token: str) -> AuthSession | None:
    return db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == hash_refresh_token(refresh_token)
        )
    )


def _session_is_expired(session: AuthSession) -> bool:
    return _ensure_utc(session.expires_at) <= _utcnow()


def _revoke_family(db: Session, family_id) -> None:
    if family_id is None:
        return
    now = _utcnow()
    sessions = db.scalars(
        select(AuthSession).where(
            AuthSession.family_id == family_id,
            AuthSession.revoked_at.is_(None),
        )
    ).all()
    for session in sessions:
        session.revoked_at = now


def _start_session(db: Session, user: User, request: Request) -> str:
    refresh_token = generate_refresh_token()
    user_agent = request.headers.get("user-agent")
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_expires_at(),
            user_agent=user_agent[:255] if user_agent else None,
        )
    )
    return refresh_token


def _issue_tokens(db: Session, user: User, request: Request) -> tuple[str, str, int]:
    access_token, expires_in = create_access_token(user.id)
    refresh_token = _start_session(db, user, request)
    db.commit()
    return access_token, refresh_token, expires_in


@router.post("/signup", response_model=SignUpResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignUpRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client = _client_key(request)
    if signup_rate_limiter.is_blocked(client):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "over_request_rate_limit")
    signup_rate_limiter.register(client)

    password = payload.password.get_secret_value()
    if len(password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "weak_password")

    email = payload.email.strip().lower()
    password_hash = hash_password(password)
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "user_already_exists")

    user = User(
        email=email,
        password_hash=password_hash,
        display_name=payload.display_name.strip(),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "user_already_exists")

    access_token, refresh_token, expires_in = _issue_tokens(db, user, request)
    _set_refresh_cookie(response, request, refresh_token)
    db.refresh(user)

    return SignUpResponse(
        status="signed_in",
        access_token=access_token,
        token_type=TOKEN_TYPE,
        expires_in=expires_in,
        user=UserOut.from_user(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    client = _client_key(request)
    if login_rate_limiter.is_blocked(client):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "over_request_rate_limit")

    email = payload.email.strip().lower()
    password = payload.password.get_secret_value()
    user = db.scalar(select(User).where(User.email == email))

    if user is None:
        verify_password(password, DUMMY_HASH)
        login_rate_limiter.register_failure(client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")

    if not user.is_active or not verify_password(password, user.password_hash):
        login_rate_limiter.register_failure(client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_credentials")

    login_rate_limiter.reset(client)
    access_token, refresh_token, expires_in = _issue_tokens(db, user, request)
    _set_refresh_cookie(response, request, refresh_token)

    return TokenResponse(
        access_token=access_token,
        token_type=TOKEN_TYPE,
        expires_in=expires_in,
        user=UserOut.from_user(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request, response: Response, db: Session = Depends(get_db)
):
    client = _client_key(request)
    if refresh_rate_limiter.is_blocked(client):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "over_request_rate_limit")

    refresh_token = _read_refresh_cookie(request)
    if not refresh_token:
        refresh_rate_limiter.register_failure(client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    session = _find_session(db, refresh_token)

    if session is None:
        refresh_rate_limiter.register_failure(client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    if session.revoked_at is not None:
        refresh_rate_limiter.register_failure(client)
        _revoke_family(db, session.family_id)
        db.commit()
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            SESSION_ERROR,
            headers=_cleared_cookie_header(request),
        )

    if _session_is_expired(session):
        refresh_rate_limiter.register_failure(client)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            SESSION_ERROR,
            headers=_cleared_cookie_header(request),
        )

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        refresh_rate_limiter.register_failure(client)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    access_token, expires_in = create_access_token(user.id)
    new_refresh_token = generate_refresh_token()
    user_agent = request.headers.get("user-agent")

    session.revoked_at = _utcnow()
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_refresh_token(new_refresh_token),
            expires_at=refresh_expires_at(),
            family_id=session.family_id,
            user_agent=user_agent[:255] if user_agent else None,
        )
    )
    db.commit()
    _set_refresh_cookie(response, request, new_refresh_token)
    refresh_rate_limiter.reset(client)

    return TokenResponse(
        access_token=access_token,
        token_type=TOKEN_TYPE,
        expires_in=expires_in,
        user=UserOut.from_user(user),
    )


@router.post("/logout")
def logout(
    request: Request, response: Response, db: Session = Depends(get_db)
):
    _deny_presented_access_token(request)
    refresh_token = _read_refresh_cookie(request)
    if refresh_token:
        session = _find_session(db, refresh_token)
        if (
            session is not None
            and session.revoked_at is None
            and not _session_is_expired(session)
        ):
            session.revoked_at = _utcnow()
            db.commit()
    _clear_refresh_cookie(response, request)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.from_user(current_user)