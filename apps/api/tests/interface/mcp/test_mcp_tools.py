"""Tests for interface/mcp/server.py tool handlers. No DB, no network —
same fake pattern as tests/application/test_start_conversation.py /
test_process_turn.py, wired in via monkeypatched dependencies.py context managers.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from sentient_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.use_cases.process_turn import ProcessTurnUseCase
from application.use_cases.start_conversation import StartConversationUseCase
from domain.conversation import Conversation
from interface.mcp import server as mcp_server


class FakeConvRepo:
    def __init__(self, conv: Conversation | None = None):
        self._store: dict[str, Conversation] = {conv.id: conv} if conv else {}

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

    async def save_template(self, t):
        self._templates[t.id] = t

    async def delete_template(self, tid: str):
        self._templates.pop(tid, None)


class FakeGraphRunner:
    def __init__(self, answer: str = "Test answer", tokens: int = 42):
        self._answer = answer
        self._tokens = tokens

    async def run(self, *, conversation_id, sme_template, user_text) -> AsyncIterator[dict]:
        yield {"events": [], "answer": self._answer, "token_total": self._tokens, "citations": []}


_SME = SmeTemplate(
    id="test-sme", name="Test SME", soul="Test soul",
    steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
)


def _patch_start_conversation_uc(monkeypatch, templates: list[SmeTemplate]):
    @asynccontextmanager
    async def fake():
        yield StartConversationUseCase(
            conversation_repo=FakeConvRepo(), sme_repo=FakeSmeRepo(templates)
        )
    monkeypatch.setattr(mcp_server, "start_conversation_uc", fake)


def _patch_process_turn_uc(monkeypatch, conv: Conversation, templates: list[SmeTemplate], answer="Test answer"):
    @asynccontextmanager
    async def fake():
        yield ProcessTurnUseCase(
            conversation_repo=FakeConvRepo(conv),
            sme_repo=FakeSmeRepo(templates),
            graph_runner=FakeGraphRunner(answer=answer),
        )
    monkeypatch.setattr(mcp_server, "process_turn_uc", fake)


@pytest.mark.asyncio
async def test_start_conversation_returns_id(monkeypatch):
    from interface.mcp import counters
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    _patch_start_conversation_uc(monkeypatch, [_SME])

    result = await mcp_server.start_conversation(sme_id="test-sme")
    assert result["sme_id"] == "test-sme"
    assert "conversation_id" in result and "created_at" in result
    assert counters.touched_conversation_count() == 1


@pytest.mark.asyncio
async def test_start_conversation_unknown_sme_raises_tool_error(monkeypatch):
    _patch_start_conversation_uc(monkeypatch, [])
    with pytest.raises(ToolError, match="not found"):
        await mcp_server.start_conversation(sme_id="does-not-exist")


@pytest.mark.asyncio
async def test_send_conversation_turn_returns_aggregated_result(monkeypatch):
    conv = Conversation(id="conv-1", sme_id="test-sme")
    conv.add_user_turn(text="seed")
    conv.add_assistant_turn(text="seed reply")
    _patch_process_turn_uc(monkeypatch, conv, [_SME], answer="The answer")
    from interface.mcp import counters
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())

    result = await mcp_server.send_conversation_turn(conversation_id="conv-1", user_text="Hi")
    assert result["answer"] == "The answer"
    assert result["total_tokens"] == 42
    assert result["citations"] == []
    assert result["steps"] == []
    assert counters.touched_conversation_count() == 1


@pytest.mark.asyncio
async def test_send_conversation_turn_unknown_conversation_raises_tool_error(monkeypatch):
    conv = Conversation(id="other", sme_id="test-sme")
    _patch_process_turn_uc(monkeypatch, conv, [_SME])
    with pytest.raises(ToolError, match="not found"):
        await mcp_server.send_conversation_turn(conversation_id="does-not-exist", user_text="Hi")
