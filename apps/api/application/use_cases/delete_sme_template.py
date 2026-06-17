"""Use case: delete a user-created SME template. Defaults are protected."""
from __future__ import annotations

from sentinel_domain.sme import DEFAULT_TEMPLATES

from application.ports.sme_repository import SmeRepositoryPort


class DeleteSmeTemplateUseCase:
    def __init__(self, repo: SmeRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, template_id: str) -> None:
        default_ids = {t.id for t in DEFAULT_TEMPLATES}
        if template_id in default_ids:
            raise ValueError(f"Cannot delete built-in default template '{template_id}'.")
        await self._repo.delete_template(template_id)
