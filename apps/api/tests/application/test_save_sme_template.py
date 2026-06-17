"""Tests for SaveSmeTemplateUseCase and DeleteSmeTemplateUseCase."""
import pytest
from application.use_cases.save_sme_template import SaveSmeTemplateUseCase
from application.use_cases.delete_sme_template import DeleteSmeTemplateUseCase
from sentinel_domain.sme import SmeTemplate, ReasoningStep, StepKind


class FakeSmeRepo:
    def __init__(self):
        self._store: dict[str, SmeTemplate] = {}

    async def list_templates(self):
        return list(self._store.values())

    async def get_template(self, tid: str):
        return self._store.get(tid)

    async def save_template(self, t: SmeTemplate):
        self._store[t.id] = t

    async def delete_template(self, tid: str):
        self._store.pop(tid, None)


@pytest.mark.asyncio
async def test_save_persists_template():
    repo = FakeSmeRepo()
    uc = SaveSmeTemplateUseCase(repo)
    t = SmeTemplate(id="my-sme", name="My SME", soul="Soul",
                    steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)])
    saved = await uc.execute(t)
    assert saved.id == "my-sme"
    assert await repo.get_template("my-sme") is not None


@pytest.mark.asyncio
async def test_save_updates_existing():
    repo = FakeSmeRepo()
    uc = SaveSmeTemplateUseCase(repo)
    t = SmeTemplate(id="my-sme", name="First", soul="Soul",
                    steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)])
    await uc.execute(t)
    updated = t.model_copy(update={"name": "Updated"})
    await uc.execute(updated)
    stored = await repo.get_template("my-sme")
    assert stored is not None
    assert stored.name == "Updated"


@pytest.mark.asyncio
async def test_delete_non_default_succeeds():
    repo = FakeSmeRepo()
    t = SmeTemplate(id="custom-sme", name="Custom", soul="Soul",
                    steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)],
                    is_default=False)
    await repo.save_template(t)
    uc = DeleteSmeTemplateUseCase(repo)
    await uc.execute("custom-sme")
    assert await repo.get_template("custom-sme") is None


@pytest.mark.asyncio
async def test_delete_default_raises():
    repo = FakeSmeRepo()
    uc = DeleteSmeTemplateUseCase(repo)
    with pytest.raises(ValueError, match="Cannot delete built-in default"):
        await uc.execute("ftse100-analyst")


@pytest.mark.asyncio
async def test_delete_mental_health_default_raises():
    repo = FakeSmeRepo()
    uc = DeleteSmeTemplateUseCase(repo)
    with pytest.raises(ValueError):
        await uc.execute("mental-health-support")
