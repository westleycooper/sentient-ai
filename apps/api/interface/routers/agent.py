"""WebSocket endpoint for the voice coding agent.

Route: /ws/agent/{session_id}

Protocol (server → client):
  {"type": "connected", "session_id": "..."}
  {"type": "text_delta",      "text": "..."}
  {"type": "tool_permission", "request_id": "...", "tool": "...", "display": "...", "input": {...}}
  {"type": "tool_result",     "request_id": "...", "tool": "...", "preview": "...", "denied": bool}
  {"type": "complete",        "total_tokens": 0}
  {"type": "error",           "message": "..."}

Protocol (client → server):
  {"type": "message",  "text": "..."}
  {"type": "approval", "request_id": "...", "approved": bool, "always": bool}

This router is excluded from the OpenAPI schema and only mounted when ENV != production
(ADR-0003 — local-only feature).
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from application.use_cases.get_agent_config import GetAgentConfigUseCase
from domain.agent_config import AgentConfig
from infrastructure.agent.anthropic_agent_runner import AnthropicAgentRunner
from infrastructure.persistence.postgres_agent_config_repo import PostgresAgentConfigRepo
from interface.dependencies import _session_factory

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"], include_in_schema=False)

# One runner instance per server process; sessions keyed by session_id UUID
_runner = AnthropicAgentRunner()


async def _load_config() -> AgentConfig:
    """Load agent config using a short-lived session — not kept open for the WS lifetime."""
    async with _session_factory()() as session:
        return await GetAgentConfigUseCase(PostgresAgentConfigRepo(session)).execute()


@router.websocket("/ws/agent/{session_id}")
async def agent_websocket(websocket: WebSocket, session_id: str) -> None:
    # Accept immediately so the client transitions out of "connecting" regardless of DB state.
    await websocket.accept()

    try:
        config = await _load_config()
    except Exception:
        logger.warning("agent_config_load_failed_using_defaults", extra={"session_id": session_id})
        config = AgentConfig()
    _runner.set_session_config(session_id, config)

    await websocket.send_json({"type": "connected", "session_id": session_id})
    logger.info("agent_ws_connected", extra={"session_id": session_id})

    active_task: asyncio.Task | None = None

    async def _stream_turn(text: str) -> None:
        try:
            async for event in _runner.run_turn(session_id, text):
                await websocket.send_json(event.as_dict())
        except Exception:
            logger.exception("agent_stream_error", extra={"session_id": session_id})
            try:
                await websocket.send_json({"type": "error", "message": "Stream failed."})
            except Exception:
                pass

    try:
        while True:
            data: dict = await websocket.receive_json()
            event_type: str = data.get("type", "")

            if event_type == "message":
                # Cancel the in-progress turn and wait for its finally block to
                # finish cleaning up (session rollback + future cancellation) before
                # starting a new turn — prevents race-corrupted message history.
                if active_task and not active_task.done():
                    active_task.cancel()
                    try:
                        await active_task
                    except (asyncio.CancelledError, Exception):
                        pass
                active_task = asyncio.create_task(_stream_turn(data.get("text", "")))

            elif event_type == "approval":
                # Unblocks the pending await in _stream_turn (asyncio.Future)
                await _runner.approve(
                    session_id=session_id,
                    request_id=data["request_id"],
                    approved=bool(data.get("approved", False)),
                    always=bool(data.get("always", False)),
                )

    except WebSocketDisconnect:
        logger.info("agent_ws_disconnected", extra={"session_id": session_id})
    except Exception:
        logger.exception("agent_ws_error", extra={"session_id": session_id})
    finally:
        if active_task and not active_task.done():
            active_task.cancel()
