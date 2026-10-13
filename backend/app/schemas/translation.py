import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

TEXT_MAX_LENGTH = 5000


class TranslationCreate(BaseModel):
    text: str
    source: Literal["live", "upload"]

    @field_validator("text")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be empty or only spaces")
        if len(value) > TEXT_MAX_LENGTH:
            raise ValueError("text is too long")
        return value


class TranslationOut(BaseModel):
    id: uuid.UUID
    text: str
    source: str
    created_at: datetime


class TranslationListOut(BaseModel):
    translations: list[TranslationOut]
    total: int
    page: int
    page_size: int