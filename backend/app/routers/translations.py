import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Translation, User
from app.schemas.translation import (
    TranslationCreate,
    TranslationListOut,
    TranslationOut,
)
from app.security.deps import get_current_user

router = APIRouter(prefix="/translations", tags=["translations"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
NOT_FOUND_MESSAGE = "not_found"


def _to_out(translation: Translation) -> TranslationOut:
    created_at = translation.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return TranslationOut(
        id=translation.id,
        text=translation.text,
        source=translation.source,
        created_at=created_at,
    )


@router.post("", response_model=TranslationOut, status_code=status.HTTP_201_CREATED)
def create_translation(
    payload: TranslationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TranslationOut:
    translation = Translation(
        user_id=current_user.id,
        text=payload.text,
        source=payload.source,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(translation)
    db.commit()
    db.refresh(translation)
    return _to_out(translation)


@router.get("", response_model=TranslationListOut)
def list_translations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TranslationListOut:
    scoped = Translation.user_id == current_user.id
    total = db.scalar(select(func.count()).select_from(Translation).where(scoped)) or 0
    rows = db.scalars(
        select(Translation)
        .where(scoped)
        .order_by(Translation.created_at.desc(), Translation.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return TranslationListOut(
        translations=[_to_out(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.delete("/{translation_id}")
def delete_translation(
    translation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    translation = db.scalar(
        select(Translation).where(
            Translation.id == translation_id,
            Translation.user_id == current_user.id,
        )
    )
    if translation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND_MESSAGE)
    db.delete(translation)
    db.commit()
    return {"ok": True}