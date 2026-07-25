"""Tests for ProcessTurnUseCase. Uses fakes for all ports."""
from collections.abc import AsyncIterator

import pytest
from sentient_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.use_cases.process_turn import ProcessTurnUseCase
from domain.conversation import Conversation

_SME = SmeTemplate(
    id="test-sme",
    name="Test SME",
    soul="Test soul",
    steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
)

_CONV = Conversation(id="conv-1", sme_id="test-sme")
_CONV.add_user_turn(text="Hello")  # seed one turn so assistant can follow


class FakeConvRepo:
    def __init__(self, conv: Conversation):
        self._store = {conv.id: conv}

    async def save(self, conv: Conversation):
        self._store[conv.id] = conv

    async def get(self, cid: str):
        return self._store.get(cid)

    async def list_for_sme(self, sme_id: str, *, limit: int = 50):
        return []


class FakeSmeRepo:
    async def list_templates(self):
        return [_SME]

    async def get_template(self, tid: str):
        return _SME if tid == _SME.id else None

    async def save_template(self, t):
        pass

    async def delete_template(self, tid: str):
        pass


class FakeGraphRunner:
    def __init__(self, answer: str = "Test answer", tokens: int = 42):
        self._answer = answer
        self._tokens = tokens

    async def run(self, *, conversation_id, sme_template, user_text) -> AsyncIterator[dict]:
        yield {"events": [], "answer": self._answer, "token_total": self._tokens}


@pytest.mark.asyncio
async def test_process_turn_adds_assistant_message():
    conv = Conversation(id="conv-2", sme_id="test-sme")
    repo = FakeConvRepo(conv)
    uc = ProcessTurnUseCase(
        conversation_repo=repo,
        sme_repo=FakeSmeRepo(),
        graph_runner=FakeGraphRunner(answer="42"),
    )
    chunks = []
    async for chunk in uc.execute(conversation_id="conv-2", user_text="What is the answer?"):
        chunks.append(chunk)

    updated = await repo.get("conv-2")
    assert updated is not None
    assistant_msgs = [m for m in updated.messages if m.role.value == "assistant"]
    assert len(assistant_msgs) == 1
    assert assistant_msgs[0].content == "42"


@pytest.mark.asyncio
async def test_process_turn_records_token_count():
    conv = Conversation(id="conv-3", sme_id="test-sme")
    repo = FakeConvRepo(conv)
    uc = ProcessTurnUseCase(
        conversation_repo=repo,
        sme_repo=FakeSmeRepo(),
        graph_runner=FakeGraphRunner(answer="Response", tokens=99),
    )
    async for _ in uc.execute(conversation_id="conv-3", user_text="Hi"):
        pass

    updated = await repo.get("conv-3")
    assistant = next(m for m in updated.messages if m.role.value == "assistant")
    assert assistant.token_count == 99


@pytest.mark.asyncio
async def test_process_turn_unknown_conversation_raises():
    repo = FakeConvRepo(Conversation(id="other", sme_id="test-sme"))
    uc = ProcessTurnUseCase(
        conversation_repo=repo,
        sme_repo=FakeSmeRepo(),
        graph_runner=FakeGraphRunner(),
    )
    with pytest.raises(ValueError, match="not found"):
        async for _ in uc.execute(conversation_id="does-not-exist", user_text="Hi"):
            pass


@pytest.mark.asyncio
async def test_process_turn_unknown_sme_raises():
    conv = Conversation(id="conv-4", sme_id="unknown-sme")
    repo = FakeConvRepo(conv)
    uc = ProcessTurnUseCase(
        conversation_repo=repo,
        sme_repo=FakeSmeRepo(),
        graph_runner=FakeGraphRunner(),
    )
    with pytest.raises(ValueError, match="not found"):
        async for _ in uc.execute(conversation_id="conv-4", user_text="Hi"):
            pass
