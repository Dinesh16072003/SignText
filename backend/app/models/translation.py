import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Translation(Base):
    __tablename__ = "translations"
    __table_args__ = (
        CheckConstraint("length(text) between 1 and 5000", name="translations_text_length"),
        CheckConstraint("source in ('live', 'upload')", name="translations_source_values"),
        Index("translations_user_created_idx", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(String(5000))
    source: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="translations")
    videos: Mapped[list["Video"]] = relationship(back_populates="translation")
