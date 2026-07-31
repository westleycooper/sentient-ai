"""SQLAlchemy ORM models. Infrastructure layer only — never imported by domain/application."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


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


class AgentConfigModel(Base):
    __tablename__ = "agent_config"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    working_mode: Mapped[str] = mapped_column(String(50), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    auto_allow_tools: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    sources: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    theme_id: Mapped[str] = mapped_column(String(100), nullable=False, server_default="dark-teal")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


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
    user_visualisation_kind: Mapped[str] = mapped_column(String(50), nullable=False, server_default="wave")
    theme_id: Mapped[str] = mapped_column(String(100), nullable=False, server_default="dark-teal")
    lesson: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    default_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    use_step_models: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
