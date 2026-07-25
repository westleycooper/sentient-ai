"""Use case: create or update an SME template."""
from __future__ import annotations

from sentient_domain.sme import SmeTemplate

from application.ports.sme_repository import SmeRepositoryPort


class SaveSmeTemplateUseCase:
    def __init__(self, repo: SmeRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, template: SmeTemplate) -> SmeTemplate:
        await self._repo.save_template(template)
        return template
