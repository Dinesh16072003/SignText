import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, SecretStr

from app.models import User


class SignUpRequest(BaseModel):
    email: EmailStr
    password: SecretStr
    display_name: str = Field(default="", max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    user_metadata: dict
    created_at: datetime | None

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            user_metadata={"display_name": user.display_name},
            created_at=user.created_at,
        )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    user: UserOut


class SignUpResponse(TokenResponse):
    status: str
