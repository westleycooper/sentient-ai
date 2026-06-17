"""Postgres adapter for SmeRepositoryPort."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_domain.sme import ReasoningStep, RetrievalSourceConfig, SmeRule, SmeTemplate
from infrastructure.persistence.models import SmeTemplateModel


class PostgresSmeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_templates(self) -> list[SmeTemplate]:
        rows = (await self._session.execute(select(SmeTemplateModel))).scalars().all()
        return [self._to_domain(r) for r in rows]

    async def get_template(self, template_id: str) -> SmeTemplate | None:
        row = await self._session.get(SmeTemplateModel, template_id)
        return self._to_domain(row) if row else None

    async def save_template(self, template: SmeTemplate) -> None:
        row = await self._session.get(SmeTemplateModel, template.id)
        if row is None:
            row = SmeTemplateModel(id=template.id)
            self._session.add(row)
        row.name = template.name
        row.soul = template.soul
        row.steps = [s.model_dump() for s in template.steps]
        row.sources = [s.model_dump() for s in template.sources]
        row.rules = [r.model_dump() for r in template.rules]
        row.is_default = template.is_default
        row.visualisation_kind = template.visualisation_kind
        await self._session.commit()

    async def delete_template(self, template_id: str) -> None:
        row = await self._session.get(SmeTemplateModel, template_id)
        if row:
            await self._session.delete(row)
            await self._session.commit()

    @staticmethod
    def _to_domain(row: SmeTemplateModel) -> SmeTemplate:
        return SmeTemplate(
            id=row.id,
            name=row.name,
            soul=row.soul,
            steps=[ReasoningStep(**s) for s in (row.steps or [])],
            sources=[RetrievalSourceConfig(**s) for s in (row.sources or [])],
            rules=[SmeRule(**r) for r in (row.rules or [])],
            is_default=row.is_default,
            visualisation_kind=row.visualisation_kind or "wave",
        )
