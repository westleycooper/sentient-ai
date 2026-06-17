"""Postgres adapter for ConversationRepositoryPort."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from domain.conversation import Conversation, Message, MessageRole
from infrastructure.persistence.models import ConversationModel, MessageModel


class PostgresConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, conversation: Conversation) -> None:
        stmt = (
            select(ConversationModel)
            .where(ConversationModel.id == conversation.id)
            .options(selectinload(ConversationModel.messages))
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            row = ConversationModel(id=conversation.id, sme_id=conversation.sme_id,
                                   created_at=conversation.created_at)
            self._session.add(row)

        existing_ids = {m.id for m in row.messages} if row.messages else set()
        for msg in conversation.messages:
            if msg.id not in existing_ids:
                self._session.add(MessageModel(
                    id=msg.id,
                    conversation_id=conversation.id,
                    role=msg.role.value,
                    content=msg.content,
                    created_at=msg.created_at,
                    token_count=msg.token_count,
                    citations=msg.citations,
                ))
        await self._session.commit()

    async def get(self, conversation_id: str) -> Conversation | None:
        stmt = (
            select(ConversationModel)
            .where(ConversationModel.id == conversation_id)
            .options(selectinload(ConversationModel.messages))
        )
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return self._to_domain(row)

    async def list_for_sme(self, sme_id: str, *, limit: int = 50) -> list[Conversation]:
        stmt = (
            select(ConversationModel)
            .where(ConversationModel.sme_id == sme_id)
            .options(selectinload(ConversationModel.messages))
            .order_by(ConversationModel.created_at.desc())
            .limit(limit)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [self._to_domain(r) for r in rows]

    def _to_domain(self, row: ConversationModel) -> Conversation:
        conv = Conversation(id=row.id, sme_id=row.sme_id, created_at=row.created_at)
        conv._messages = [
            Message(
                id=m.id,
                role=MessageRole(m.role),
                content=m.content,
                created_at=m.created_at,
                token_count=m.token_count,
                citations=m.citations or [],
            )
            for m in (row.messages or [])
        ]
        return conv
