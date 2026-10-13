from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import PASSWORD_MIN_LENGTH
from app.db import get_db
from app.models import AuthSession, User
from app.schemas.auth import (
    SignUpRequest,
    SignUpResponse,
    UserOut,
)
from app.security.passwords import hash_password
from app.security.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_expires_at,
)

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_TYPE = "bearer"


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
def signup(payload: SignUpRequest, request: Request, db: Session = Depends(get_db)):
    password = payload.password.get_secret_value()
    if len(password) < PASSWORD_MIN_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "weak_password")

    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "user_already_exists")

    user = User(
        email=email,
        password_hash=hash_password(password),
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
    db.refresh(user)

    return SignUpResponse(
        status="signed_in",
        access_token=access_token,
        token_type=TOKEN_TYPE,
        expires_in=expires_in,
        refresh_token=refresh_token,
        user=UserOut.from_user(user),
    )