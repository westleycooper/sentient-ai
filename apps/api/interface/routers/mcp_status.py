"""Read-only status for the /mcp frontend page. NOT the MCP protocol itself
(that's mounted separately at /mcp, local-only — ADR-0004). Always available,
including in production, so the page can show an honest 'not mounted' state.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends

from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from interface.dependencies import get_get_sme_uc
from interface.dto import McpResourceInfo, McpStatusResponse, McpToolInfo
from interface.mcp import counters

router = APIRouter(prefix="/mcp-status", tags=["mcp"])

_RESOURCES = [
    McpResourceInfo(
        uri_template="sentinel://sme-templates",
        name="list_sme_templates",
        description="All SME templates, summary fields.",
        wraps="GetSmeTemplatesUseCase",
    ),
    McpResourceInfo(
        uri_template="sentinel://sme-templates/{template_id}",
        name="get_sme_template",
        description="Full SME template definition.",
        wraps="GetSmeTemplatesUseCase",
    ),
    McpResourceInfo(
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
    return McpStatusResponse(
        mounted=os.getenv("ENV", "local") != "production",
        resources=_RESOURCES,
        tools=_TOOLS,
        sme_template_count=len(templates),
        conversations_touched_count=counters.touched_conversation_count(),
    )
