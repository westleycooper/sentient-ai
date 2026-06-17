"""SQLAlchemy ORM models. Infrastructure layer only — never imported by domain/application."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConversationModel(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sme_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    messages: Mapped[list[MessageModel]] = relationship(
        "MessageModel", back_populates="conversation", order_by="MessageModel.created_at"
    )


class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    citations: Mapped[dict] = mapped_column(JSON, default=list)
    conversation: Mapped[ConversationModel] = relationship("ConversationModel", back_populates="messages")


class SmeTemplateModel(Base):
    __tablename__ = "sme_templates"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    soul: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    sources: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    rules: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    visualisation_kind: Mapped[str] = mapped_column(String(50), nullable=False, server_default="wave")
