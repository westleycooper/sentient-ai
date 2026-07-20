"""Tests for interface/routers/mcp_status.py. A standalone FastAPI app mounting
just this router — avoids importing main.py's full lifespan/DB wiring, which
this endpoint doesn't need. No DB, no network.
"""
from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from sentinel_domain.sme import ReasoningStep, SmeTemplate, StepKind

from interface.dependencies import get_get_sme_uc
from interface.mcp import counters
from interface.routers import mcp_status


class FakeGetSmeTemplatesUseCase:
    def __init__(self, templates: list[SmeTemplate]):
        self._templates = templates

    async def execute(self):
        return self._templates


_TEMPLATES = [
    SmeTemplate(id="a", name="A", soul="s", steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)]),
    SmeTemplate(id="b", name="B", soul="s", steps=[ReasoningStep(id="r", name="R", kind=StepKind.REASON)]),
]


def _make_app(templates: list[SmeTemplate]) -> FastAPI:
    app = FastAPI()
    app.include_router(mcp_status.router)
    app.dependency_overrides[get_get_sme_uc] = lambda: FakeGetSmeTemplatesUseCase(templates)
    return app


@pytest.mark.asyncio
async def test_mcp_status_returns_counts_and_surface(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    monkeypatch.delenv("ENV", raising=False)
    app = _make_app(_TEMPLATES)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/mcp-status")

    assert resp.status_code == 200
    body = resp.json()
    assert body["mounted"] is True
    assert body["mount_path"] == "/mcp"
    assert body["sme_template_count"] == 2
    assert body["conversations_touched_count"] == 0
    assert {r["name"] for r in body["resources"]} == {
        "list_sme_templates", "get_sme_template", "get_conversation",
    }
    assert {t["name"] for t in body["tools"]} == {"start_conversation", "send_conversation_turn"}

    by_name = {r["name"]: r for r in body["resources"]}
    assert by_name["list_sme_templates"]["params"] == []
    assert by_name["get_sme_template"]["params"] == ["template_id"]
    assert by_name["get_conversation"]["params"] == ["conversation_id"]

    tools_by_name = {t["name"]: t for t in body["tools"]}
    start_schema = tools_by_name["start_conversation"]["input_schema"]
    assert start_schema["required"] == ["sme_id"]
    assert "sme_id" in start_schema["properties"]
    turn_schema = tools_by_name["send_conversation_turn"]["input_schema"]
    assert set(turn_schema["required"]) == {"conversation_id", "user_text"}


@pytest.mark.asyncio
async def test_mcp_status_reports_not_mounted_in_production(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    monkeypatch.setenv("ENV", "production")
    app = _make_app(_TEMPLATES)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/mcp-status")

    assert resp.status_code == 200
    assert resp.json()["mounted"] is False


@pytest.mark.asyncio
async def test_mcp_status_reflects_touched_conversations(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    counters.record_conversation_touch("conv-1")
    counters.record_conversation_touch("conv-2")
    app = _make_app(_TEMPLATES)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/mcp-status")

    assert resp.json()["conversations_touched_count"] == 2
