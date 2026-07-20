"""Tests for interface/mcp/server.py resource handlers. No DB, no network —
dependencies.py's context managers are monkeypatched to yield fakes-backed
use cases/repos, same fake pattern as tests/application/test_start_conversation.py.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest
from mcp.server.fastmcp.exceptions import ResourceError
from sentinel_domain.sme import (
    ReasoningStep,
    RetrievalSourceConfig,
    RetrievalSourceKind,
    SmeRule,
    SmeTemplate,
    StepKind,
)

from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from domain.conversation import Conversation
from interface.mcp import server as mcp_server


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


class FakeConvRepo:
    def __init__(self, conv: Conversation | None = None):
        self._store: dict[str, Conversation] = {conv.id: conv} if conv else {}

    async def save(self, conv: Conversation):
        self._store[conv.id] = conv

    async def get(self, cid: str):
        return self._store.get(cid)

    async def list_for_sme(self, sme_id: str, *, limit: int = 50):
        return [c for c in self._store.values() if c.sme_id == sme_id]


_SIMPLE_SME = SmeTemplate(
    id="simple-sme", name="Simple SME", soul="Test soul",
    steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
)
_FULL_SME = SmeTemplate(
    id="full-sme", name="Full SME", soul="Full soul",
    steps=[ReasoningStep(id="r", name="Reason", kind=StepKind.REASON)],
    sources=[RetrievalSourceConfig(id="src", name="Source", kind=RetrievalSourceKind.HTTP_API)],
    rules=[SmeRule(id="rule", description="Be nice")],
    is_default=True,
)


def _patch_sme_templates_uc(monkeypatch, templates: list[SmeTemplate]):
    @asynccontextmanager
    async def fake():
        yield GetSmeTemplatesUseCase(FakeSmeRepo(templates))
    monkeypatch.setattr(mcp_server, "sme_templates_uc", fake)


def _patch_conversation_repo(monkeypatch, conv: Conversation | None):
    @asynccontextmanager
    async def fake():
        yield FakeConvRepo(conv)
    monkeypatch.setattr(mcp_server, "conversation_repo", fake)


@pytest.mark.asyncio
async def test_list_sme_templates_returns_summary_fields(monkeypatch):
    # GetSmeTemplatesUseCase always merges in sentinel_domain.sme.DEFAULT_TEMPLATES
    # (stored wins on id collision) — assert our fakes are present, not exact set equality.
    _patch_sme_templates_uc(monkeypatch, [_SIMPLE_SME, _FULL_SME])
    result = json.loads(await mcp_server.list_sme_templates())
    assert {"simple-sme", "full-sme"}.issubset({t["id"] for t in result})
    full = next(t for t in result if t["id"] == "full-sme")
    assert full == {
        "id": "full-sme", "name": "Full SME", "is_default": True,
        "step_count": 1, "source_count": 1, "visualisation_kind": "wave",
    }


@pytest.mark.asyncio
async def test_get_sme_template_returns_full_definition(monkeypatch):
    _patch_sme_templates_uc(monkeypatch, [_FULL_SME])
    result = json.loads(await mcp_server.get_sme_template("full-sme"))
    assert result["soul"] == "Full soul"
    assert result["sources"][0]["id"] == "src"
    assert result["rules"][0]["id"] == "rule"


@pytest.mark.asyncio
async def test_get_sme_template_unknown_id_raises_resource_error(monkeypatch):
    _patch_sme_templates_uc(monkeypatch, [_SIMPLE_SME])
    with pytest.raises(ResourceError, match="not found"):
        await mcp_server.get_sme_template("does-not-exist")


@pytest.mark.asyncio
async def test_get_conversation_returns_transcript(monkeypatch):
    conv = Conversation(id="conv-1", sme_id="simple-sme")
    conv.add_user_turn(text="Hello")
    conv.add_assistant_turn(text="Hi there", token_count=5)
    _patch_conversation_repo(monkeypatch, conv)

    result = json.loads(await mcp_server.get_conversation("conv-1"))
    assert result["id"] == "conv-1"
    assert result["sme_id"] == "simple-sme"
    assert [m["role"] for m in result["messages"]] == ["user", "assistant"]
    assert result["messages"][1]["token_count"] == 5


@pytest.mark.asyncio
async def test_get_conversation_unknown_id_raises_resource_error(monkeypatch):
    _patch_conversation_repo(monkeypatch, None)
    with pytest.raises(ResourceError, match="not found"):
        await mcp_server.get_conversation("does-not-exist")


@pytest.mark.asyncio
async def test_get_conversation_records_touch(monkeypatch):
    conv = Conversation(id="conv-touch", sme_id="simple-sme")
    _patch_conversation_repo(monkeypatch, conv)
    from interface.mcp import counters
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())

    await mcp_server.get_conversation("conv-touch")
    assert counters.touched_conversation_count() == 1
