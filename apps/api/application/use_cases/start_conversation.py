"""Use case: start a new conversation session for a given SME."""
from __future__ import annotations

from application.ports.conversation_repository import ConversationRepositoryPort
from application.ports.sme_repository import SmeRepositoryPort
from domain.conversation import Conversation, ConversationStartedEvent


class StartConversationUseCase:
    def __init__(
        self,
        *,
        conversation_repo: ConversationRepositoryPort,
        sme_repo: SmeRepositoryPort,
    ) -> None:
        self._conv_repo = conversation_repo
        self._sme_repo = sme_repo

    async def execute(self, sme_id: str) -> Conversation:
        template = await self._sme_repo.get_template(sme_id)
        if template is None:
            raise ValueError(f"SME template {sme_id!r} not found.")

        conv = Conversation(sme_id=sme_id)
        conv._events.append(ConversationStartedEvent(conversation_id=conv.id, sme_id=sme_id))
        await self._conv_repo.save(conv)
        return conv
