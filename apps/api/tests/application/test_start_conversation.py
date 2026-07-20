"""Tests for StartConversationUseCase."""
import pytest
from sentinel_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.use_cases.start_conversation import StartConversationUseCase
from domain.conversation import Conversation


class FakeConvRepo:
    def __init__(self):
        self._store: dict[str, Conversation] = {}

    async def save(self, conv: Conversation):
        self._store[conv.id] = conv

    async def get(self, cid: str):
        return self._store.get(cid)

    async def list_for_sme(self, sme_id: str, *, limit: int = 50):
        return [c for c in self._store.values() if c.sme_id == sme_id]


class FakeSmeRepo:
    def __init__(self, templates: list[SmeTemplate]):
        self._templates = {t.id: t for t in templates}

    async def list_templates(self):
        return list(self._templates.values())

    async def get_template(self, tid: str):
        return self._templates.get(tid)

    async def save_template(self, t: SmeTemplate):
        self._templates[t.id] = t

    async def delete_template(self, tid: str):
        self._templates.pop(tid, None)


_SME = SmeTemplate(
    id="test-sme",
    name="Test",
    soul="Test soul",
    steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)],
)


@pytest.mark.asyncio
async def test_start_conversation_creates_and_persists():
    conv_repo = FakeConvRepo()
    sme_repo = FakeSmeRepo([_SME])
    uc = StartConversationUseCase(conversation_repo=conv_repo, sme_repo=sme_repo)
    conv = await uc.execute("test-sme")
    assert conv.sme_id == "test-sme"
    stored = await conv_repo.get(conv.id)
    assert stored is not None


@pytest.mark.asyncio
async def test_start_conversation_unknown_sme_raises():
    conv_repo = FakeConvRepo()
    sme_repo = FakeSmeRepo([])
    uc = StartConversationUseCase(conversation_repo=conv_repo, sme_repo=sme_repo)
    with pytest.raises(ValueError, match="not found"):
        await uc.execute("non-existent-sme")
