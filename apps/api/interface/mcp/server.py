"""Sentient AI's MCP server (ADR-0004) — exposes SME templates and conversation
state to external MCP clients. Local-development only: mounted in main.py
only when ENV != production, since the conversation resource returns PII
(transcripts, CLAUDE.md §9) with no auth on the MCP transport in v1.

Thin wrappers only — all logic lives in the application-layer use cases these
handlers call via interface/mcp/dependencies.py. No new domain/application code.
"""
from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ResourceError, ToolError

from interface.mcp import counters
from interface.mcp.dependencies import (
    conversation_repo,
    process_turn_uc,
    sme_templates_uc,
    start_conversation_uc,
)

mcp = FastMCP(
    "Sentient AI",
    instructions=(
        "Exposes Sentient AI's SME reasoning templates and live conversation "
        "transcripts. Conversation resources may contain user-identifying "
        "data (PII) — treat responses accordingly. Local-development only "
        "in v1 (ADR-0004)."
    ),
    stateless_http=True,
    json_response=True,
)
# Default streamable_http_path is "/mcp"; main.py mounts this app at "/mcp"
# itself, so serve at the sub-app's own root to avoid a "/mcp/mcp" path.
mcp.settings.streamable_http_path = "/"


@mcp.resource("sentient://sme-templates")
async def list_sme_templates() -> str:
    """All SME templates (defaults + user-created) — summary fields only."""
    async with sme_templates_uc() as uc:
        templates = await uc.execute()
    return json.dumps([
        {
            "id": t.id,
            "name": t.name,
            "is_default": t.is_default,
            "step_count": len(t.steps),
            "source_count": len(t.sources),
            "visualisation_kind": t.visualisation_kind,
        }
        for t in templates
    ])


@mcp.resource("sentient://sme-templates/{template_id}")
async def get_sme_template(template_id: str) -> str:
    """Full SME template: soul, reasoning steps, retrieval sources, rules."""
    async with sme_templates_uc() as uc:
        templates = await uc.execute()
    match = next((t for t in templates if t.id == template_id), None)
    if match is None:
        raise ResourceError(f"SME template {template_id!r} not found.")
    return json.dumps({
        "id": match.id,
        "name": match.name,
        "soul": match.soul,
        "steps": [s.model_dump() for s in match.steps],
        "sources": [s.model_dump() for s in match.sources],
        "rules": [r.model_dump() for r in match.rules],
        "is_default": match.is_default,
        "visualisation_kind": match.visualisation_kind,
        "theme_id": match.theme_id,
    })


@mcp.resource("sentient://conversations/{conversation_id}")
async def get_conversation(conversation_id: str) -> str:
    """Conversation transcript (messages, token counts, citations). Contains PII."""
    async with conversation_repo() as repo:
        conv = await repo.get(conversation_id)
    if conv is None:
        raise ResourceError(f"Conversation {conversation_id!r} not found.")
    counters.record_conversation_touch(conv.id)
    return json.dumps({
        "id": conv.id,
        "sme_id": conv.sme_id,
        "created_at": conv.created_at.isoformat(),
        "messages": [
            {
                "id": m.id,
                "role": m.role.value,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
                "token_count": m.token_count,
                "citations": m.citations,
            }
            for m in conv.messages
        ],
    })


@mcp.tool()
async def start_conversation(sme_id: str) -> dict:
    """Start a new Sentient AI conversation against the given SME template id."""
    async with start_conversation_uc() as uc:
        try:
            conv = await uc.execute(sme_id=sme_id)
        except ValueError as exc:
            raise ToolError(str(exc)) from exc
    counters.record_conversation_touch(conv.id)
    return {"conversation_id": conv.id, "sme_id": conv.sme_id, "created_at": conv.created_at.isoformat()}


@mcp.tool()
async def send_conversation_turn(conversation_id: str, user_text: str) -> dict:
    """Send a user turn; drains reasoning to completion and returns the final
    answer, token totals, citations, and a per-step summary (no MCP progress
    streaming in v1 — see ADR-0004)."""
    async with process_turn_uc() as uc:
        state: dict = {}
        try:
            async for partial in uc.execute(conversation_id=conversation_id, user_text=user_text):
                state.update(partial)
        except ValueError as exc:
            raise ToolError(str(exc)) from exc
    counters.record_conversation_touch(conversation_id)
    return {
        "answer": state.get("answer", ""),
        "total_tokens": state.get("token_total", 0),
        "citations": state.get("citations", []),
        "steps": [
            {
                "step_id": e.step_id,
                "step_name": e.step_name,
                "phase": e.phase,
                "latency_ms": e.latency_ms,
                "total_tokens": e.total_tokens,
                "model": e.model,
            }
            for e in state.get("events", [])
        ],
    }
