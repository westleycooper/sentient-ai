"""Tests for interface/routers/mcp_explorer.py — the interactive companion to
/mcp-status (ADR-0004 addendum). Drives the real FastAPI route via httpx, so
the actual mcp.call_tool/mcp.read_resource dispatch is exercised (not
re-mocked) — that dispatch is the new mechanism worth covering. Underlying
use cases are faked via the same monkeypatch pattern as
tests/interface/mcp/test_mcp_resources.py / test_mcp_tools.py — no DB, no
network, no real LLM calls.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import FastAPI
from sentinel_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from application.use_cases.process_turn import ProcessTurnUseCase
from application.use_cases.start_conversation import StartConversationUseCase
from domain.conversation import Conversation
from interface.mcp import counters
from interface.mcp import server as mcp_server
from interface.routers import mcp_explorer


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


def _patch_sme_templates_uc(monkeypatch, templates: list[SmeTemplate]):
    @asynccontextmanager
    async def fake():
        yield GetSmeTemplatesUseCase(FakeSmeRepo(templates))
    monkeypatch.setattr(mcp_server, "sme_templates_uc", fake)


def _patch_start_conversation_uc(monkeypatch, templates: list[SmeTemplate]):
    @asynccontextmanager
    async def fake():
        yield StartConversationUseCase(conversation_repo=FakeConvRepo(), sme_repo=FakeSmeRepo(templates))
    monkeypatch.setattr(mcp_server, "start_conversation_uc", fake)


def _patch_process_turn_uc(monkeypatch, conv: Conversation, templates: list[SmeTemplate], answer="Test answer"):
    @asynccontextmanager
    async def fake():
        yield ProcessTurnUseCase(
            conversation_repo=FakeConvRepo(conv), sme_repo=FakeSmeRepo(templates),
            graph_runner=FakeGraphRunner(answer=answer),
        )
    monkeypatch.setattr(mcp_server, "process_turn_uc", fake)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(mcp_explorer.router)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.fixture(autouse=True)
def _reset_counters(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())


@pytest.mark.asyncio
async def test_read_resource_no_params(client, monkeypatch):
    _patch_sme_templates_uc(monkeypatch, [_SME])
    async with client as c:
        resp = await c.post("/mcp-status/resources/read", json={"uri": "sentinel://sme-templates"})
    assert resp.status_code == 200
    body = resp.json()["content"]
    assert any(t["id"] == "test-sme" for t in body)


@pytest.mark.asyncio
async def test_read_resource_templated(client, monkeypatch):
    _patch_sme_templates_uc(monkeypatch, [_SME])
    async with client as c:
        resp = await c.post(
            "/mcp-status/resources/read", json={"uri": "sentinel://sme-templates/test-sme"}
        )
    assert resp.status_code == 200
    assert resp.json()["content"]["soul"] == "Test soul"


@pytest.mark.asyncio
async def test_read_resource_unknown_uri_returns_400(client, monkeypatch):
    _patch_sme_templates_uc(monkeypatch, [_SME])
    async with client as c:
        resp = await c.post("/mcp-status/resources/read", json={"uri": "sentinel://does-not-exist"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_call_tool_start_conversation(client, monkeypatch):
    _patch_start_conversation_uc(monkeypatch, [_SME])
    async with client as c:
        resp = await c.post(
            "/mcp-status/tools/call",
            json={"name": "start_conversation", "arguments": {"sme_id": "test-sme"}},
        )
    assert resp.status_code == 200
    content = resp.json()["content"]
    assert content["sme_id"] == "test-sme"
    assert "conversation_id" in content
    assert counters.touched_conversation_count() == 1


@pytest.mark.asyncio
async def test_call_tool_start_conversation_bad_sme_returns_400(client, monkeypatch):
    _patch_start_conversation_uc(monkeypatch, [])
    async with client as c:
        resp = await c.post(
            "/mcp-status/tools/call",
            json={"name": "start_conversation", "arguments": {"sme_id": "does-not-exist"}},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_call_tool_send_conversation_turn(client, monkeypatch):
    conv = Conversation(id="conv-1", sme_id="test-sme")
    conv.add_user_turn(text="seed")
    conv.add_assistant_turn(text="seed reply")
    _patch_process_turn_uc(monkeypatch, conv, [_SME], answer="The answer")

    async with client as c:
        resp = await c.post(
            "/mcp-status/tools/call",
            json={
                "name": "send_conversation_turn",
                "arguments": {"conversation_id": "conv-1", "user_text": "Hi"},
            },
        )
    assert resp.status_code == 200
    content = resp.json()["content"]
    assert content["answer"] == "The answer"
    assert content["total_tokens"] == 42


@pytest.mark.asyncio
async def test_call_unknown_tool_returns_400(client):
    async with client as c:
        resp = await c.post("/mcp-status/tools/call", json={"name": "does_not_exist", "arguments": {}})
    assert resp.status_code == 400
