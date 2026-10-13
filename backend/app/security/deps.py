import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security.denylist import is_denied
from app.security.tokens import decode_access_token

SESSION_ERROR = "session_expired"

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    if payload.get("jti") and is_denied(str(payload["jti"])):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SESSION_ERROR)

    return user
