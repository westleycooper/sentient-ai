"""Tests for GetSmeTemplatesUseCase."""
import pytest
from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from sentinel_domain.sme import DEFAULT_TEMPLATES, SmeTemplate, StepKind, ReasoningStep


class FakeSmeRepo:
    def __init__(self, stored: list[SmeTemplate] | None = None):
        self._stored = stored or []

    async def list_templates(self) -> list[SmeTemplate]:
        return self._stored

    async def get_template(self, template_id: str) -> SmeTemplate | None:
        return next((t for t in self._stored if t.id == template_id), None)

    async def save_template(self, template: SmeTemplate) -> None:
        self._stored.append(template)

    async def delete_template(self, template_id: str) -> None:
        self._stored = [t for t in self._stored if t.id != template_id]


@pytest.mark.asyncio
async def test_returns_all_defaults_when_repo_empty():
    uc = GetSmeTemplatesUseCase(FakeSmeRepo())
    result = await uc.execute()
    assert len(result) == len(DEFAULT_TEMPLATES)
    result_ids = {t.id for t in result}
    for t in DEFAULT_TEMPLATES:
        assert t.id in result_ids


@pytest.mark.asyncio
async def test_stored_template_overrides_default():
    custom = SmeTemplate(
        id="ftse100-analyst",
        name="My Custom FTSE",
        soul="Custom soul",
        steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
    )
    uc = GetSmeTemplatesUseCase(FakeSmeRepo(stored=[custom]))
    result = await uc.execute()
    matched = next(t for t in result if t.id == "ftse100-analyst")
    assert matched.name == "My Custom FTSE"


@pytest.mark.asyncio
async def test_user_created_template_appended():
    user_template = SmeTemplate(
        id="my-sme",
        name="My SME",
        soul="Custom",
        steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
    )
    uc = GetSmeTemplatesUseCase(FakeSmeRepo(stored=[user_template]))
    result = await uc.execute()
    assert any(t.id == "my-sme" for t in result)
    # Defaults still present (user template doesn't replace defaults with different ids)
    assert any(t.id == "mental-health-support" for t in result)
