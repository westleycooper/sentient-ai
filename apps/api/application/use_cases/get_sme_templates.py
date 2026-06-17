"""Use case: list all SME templates (defaults + user-created)."""
from __future__ import annotations

from sentinel_domain.sme import DEFAULT_TEMPLATES, SmeTemplate

from application.ports.sme_repository import SmeRepositoryPort


class GetSmeTemplatesUseCase:
    def __init__(self, repo: SmeRepositoryPort) -> None:
        self._repo = repo

    async def execute(self) -> list[SmeTemplate]:
        stored = await self._repo.list_templates()
        stored_ids = {t.id for t in stored}
        defaults = [t for t in DEFAULT_TEMPLATES if t.id not in stored_ids]
        return defaults + stored
