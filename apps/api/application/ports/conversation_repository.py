"""ConversationRepositoryPort — one repository for the Conversation aggregate."""
from __future__ import annotations

from typing import Protocol

from domain.conversation import Conversation


class ConversationRepositoryPort(Protocol):
    async def save(self, conversation: Conversation) -> None: ...
    async def get(self, conversation_id: str) -> Conversation | None: ...
    async def list_for_sme(self, sme_id: str, *, limit: int = 50) -> list[Conversation]: ...
