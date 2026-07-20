"""Interactive companion to /mcp-status (ADR-0004 addendum) — lets the /mcp
frontend page actually invoke resources/tools, not just describe them.

Unlike mcp_status.py, this executes real actions (including running the
LangGraph reasoning graph via send_conversation_turn), so it is gated
ENV != production in main.py exactly like the raw /mcp protocol mount —
kept in its own router/file specifically so that gating can differ from the
always-on, read-only /mcp-status endpoint.

Reuses the mcp SDK's own in-process dispatch (mcp.call_tool / mcp.read_resource)
rather than re-implementing resource/tool routing here.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from interface.dto import McpCallToolRequest, McpInteractResponse, McpReadResourceRequest
from interface.mcp.server import mcp

router = APIRouter(prefix="/mcp-status", tags=["mcp"])


def _decode(raw: str) -> object:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


@router.post("/resources/read", response_model=McpInteractResponse)
async def read_resource(body: McpReadResourceRequest):
    try:
        contents = await mcp.read_resource(body.uri)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raw = contents[0].content if contents else ""
    return McpInteractResponse(content=_decode(raw))


@router.post("/tools/call", response_model=McpInteractResponse)
async def call_tool(body: McpCallToolRequest):
    try:
        result = await mcp.call_tool(body.name, body.arguments)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # call_tool is typed Sequence[ContentBlock] | dict[str, Any]; in practice it
    # returns a TextContent list for every tool here, but handle the dict shape
    # defensively rather than assume away a documented return path.
    if isinstance(result, dict):
        return McpInteractResponse(content=result)
    text = result[0].text if result else ""
    return McpInteractResponse(content=_decode(text))
