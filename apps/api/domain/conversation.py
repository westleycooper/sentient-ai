"""Conversation aggregate and Message entity. Pure domain — no framework imports.

Invariants enforced here:
- A Conversation must have an SME id set before turns are processed.
- Turns alternate: user → assistant → user …; duplicate roles raise DomainError.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


class DomainError(Exception):
    pass


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


@dataclass
class DomainEvent:
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class TurnCompletedEvent(DomainEvent):
    conversation_id: str = ""
    message_id: str = ""
    sme_id: str = ""
    total_tokens: int = 0


@dataclass
class ConversationStartedEvent(DomainEvent):
    conversation_id: str = ""
    sme_id: str = ""


@dataclass
class Message:
    id: str
    role: MessageRole
    content: str
    created_at: datetime
    token_count: int = 0
    citations: list[dict[str, Any]] = field(default_factory=list)


class Conversation:
    """Aggregate root for a voice conversation session."""

    def __init__(
        self,
        *,
        id: str | None = None,
        sme_id: str,
        created_at: datetime | None = None,
    ) -> None:
        self.id: str = id or str(uuid.uuid4())
        self.sme_id = sme_id
        self.created_at: datetime = created_at or datetime.now(timezone.utc)
        self._messages: list[Message] = []
        self._events: list[DomainEvent] = []

    # --- command methods ---

    def add_user_turn(self, *, text: str) -> Message:
        self._assert_no_consecutive_role(MessageRole.USER)
        msg = Message(
            id=str(uuid.uuid4()),
            role=MessageRole.USER,
            content=text,
            created_at=datetime.now(timezone.utc),
        )
        self._messages.append(msg)
        return msg

    def add_assistant_turn(
        self, *, text: str, token_count: int = 0, citations: list[dict[str, Any]] | None = None
    ) -> Message:
        self._assert_no_consecutive_role(MessageRole.ASSISTANT)
        msg = Message(
            id=str(uuid.uuid4()),
            role=MessageRole.ASSISTANT,
            content=text,
            created_at=datetime.now(timezone.utc),
            token_count=token_count,
            citations=citations or [],
        )
        self._messages.append(msg)
        self._events.append(
            TurnCompletedEvent(
                conversation_id=self.id,
                message_id=msg.id,
                sme_id=self.sme_id,
                total_tokens=token_count,
            )
        )
        return msg

    # --- query methods ---

    @property
    def messages(self) -> list[Message]:
        return list(self._messages)

    def pull_events(self) -> list[DomainEvent]:
        evs, self._events = self._events, []
        return evs

    # --- invariant helpers ---

    def _assert_no_consecutive_role(self, role: MessageRole) -> None:
        if self._messages and self._messages[-1].role == role:
            raise DomainError(f"Consecutive {role} messages are not allowed.")
