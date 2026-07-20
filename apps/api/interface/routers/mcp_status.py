"""Read-only status for the /mcp frontend page. NOT the MCP protocol itself
(that's mounted separately at /mcp, local-only — ADR-0004). Always available,
including in production, so the page can show an honest 'not mounted' state.
"""
from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends

from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from interface.dependencies import get_get_sme_uc
from interface.dto import McpResourceInfo, McpStatusResponse, McpToolInfo
from interface.mcp import counters
from interface.mcp.server import mcp

router = APIRouter(prefix="/mcp-status", tags=["mcp"])

_PARAM_RE = re.compile(r"\{(\w+)\}")

def _resource(*, uri_template: str, name: str, description: str, wraps: str) -> McpResourceInfo:
    return McpResourceInfo(
        uri_template=uri_template,
        name=name,
        description=description,
        wraps=wraps,
        params=_PARAM_RE.findall(uri_template),
    )


_RESOURCES = [
    _resource(
        uri_template="sentinel://sme-templates",
        name="list_sme_templates",
        description="All SME templates, summary fields.",
        wraps="GetSmeTemplatesUseCase",
    ),
    _resource(
        uri_template="sentinel://sme-templates/{template_id}",
        name="get_sme_template",
        description="Full SME template definition.",
        wraps="GetSmeTemplatesUseCase",
    ),
    _resource(
        uri_template="sentinel://conversations/{conversation_id}",
        name="get_conversation",
        description="Conversation transcript. Contains PII.",
        wraps="ConversationRepositoryPort.get",
    ),
]
_TOOLS = [
    McpToolInfo(
        name="start_conversation",
        description="Start a new conversation for an SME template.",
        wraps="StartConversationUseCase",
    ),
    McpToolInfo(
        name="send_conversation_turn",
        description="Send a turn; returns final answer + step summary.",
        wraps="ProcessTurnUseCase",
    ),
]


@router.get("", response_model=McpStatusResponse)
async def get_mcp_status(uc: GetSmeTemplatesUseCase = Depends(get_get_sme_uc)):
    templates = await uc.execute()

    # Real JSON Schema per tool, straight from the SDK's own registry —
    # keeps the explorer's forms in sync with the actual handler signatures.
    live_tools = await mcp.list_tools()
    schema_by_name = {t.name: t.inputSchema for t in live_tools}
    tools = [
        t.model_copy(update={"input_schema": schema_by_name.get(t.name, {})})
        for t in _TOOLS
    ]

    return McpStatusResponse(
        mounted=os.getenv("ENV", "local") != "production",
        resources=_RESOURCES,
        tools=tools,
        sme_template_count=len(templates),
        conversations_touched_count=counters.touched_conversation_count(),
    )
