"""AnthropicAgentRunner — implements AgentRunnerPort via the Anthropic streaming API.

Streams text deltas, pauses at tool_use blocks to await WebSocket approval, then
executes approved tools via LocalToolExecutor and continues the conversation.

anthropic SDK is imported here (infrastructure only — CLAUDE.md §3, ADR-0003).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import anthropic

from application.ports.agent_runner_port import (
    AgentCompleteEvent,
    AgentErrorEvent,
    AgentEvent,
    AgentRunnerPort,
    TextDeltaEvent,
    ToolPermissionEvent,
    ToolResultEvent,
)
from domain.agent_config import AgentConfig
from domain.agent_session import AgentSession
from infrastructure.agent.local_tool_executor import LocalToolExecutor

logger = logging.getLogger(__name__)

_MODEL = os.environ.get("AGENT_MODEL", "claude-sonnet-5")


def _find_repo_root(start: Path) -> Path:
    """Walk up from start until a .git directory is found; fall back to start."""
    for p in [start, *start.parents]:
        if (p / ".git").exists():
            return p
    return start


_PROJECT_DIR = os.environ.get(
    "AGENT_PROJECT_DIR",
    str(_find_repo_root(Path(__file__).parent)),
)

_SYSTEM_PROMPT = """\
You are Sentinel, an AI coding assistant embedded in the Sentinel voice agent \
platform. You have direct access to the project source code and can read, edit, \
and run it.

Project root: {project_dir}

Guidelines:
- Keep responses concise — they will be read aloud via text-to-speech.
- After making code changes, briefly confirm what you changed.
- Use relative paths from the project root for all file operations.
- When asked to change something, read the relevant file first, then edit it.
- Narrate each step of multi-step work as you go so the user knows what is happening.\
"""

_TOOLS: list[dict] = [
    {
        "name": "bash",
        "description": "Run a shell command in the project root directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (default 30)",
                    "default": 30,
                },
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a file's full contents.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path relative to project root",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a file with the given content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path relative to project root",
                },
                "content": {
                    "type": "string",
                    "description": "Complete file contents to write",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "edit_file",
        "description": "Replace an exact string in a file with new content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path relative to project root",
                },
                "old_string": {
                    "type": "string",
                    "description": "Exact string to find (must be unique in the file)",
                },
                "new_string": {
                    "type": "string",
                    "description": "Replacement string",
                },
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and directories at a path.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path relative to project root (default '.')",
                },
            },
            "required": [],
        },
    },
]


def _tool_display(tool: str, inp: dict) -> str:
    """Human-readable one-line (or two-line) preview for the approval card."""
    match tool:
        case "bash":
            return inp.get("command", "")[:200]
        case "read_file":
            return inp.get("path", "")
        case "write_file":
            lines = inp.get("content", "").split("\n")[:3]
            preview = "\n".join(lines)
            return f"{inp.get('path', '')}\n{preview}"
        case "edit_file":
            old = inp.get("old_string", "")[:80].replace("\n", "↵")
            new = inp.get("new_string", "")[:80].replace("\n", "↵")
            return f"{inp.get('path', '')}\n− {old}\n+ {new}"
        case "list_directory":
            return inp.get("path", ".")
        case _:
            return json.dumps(inp)[:200]


async def _fetch_sources_context(sources: list[dict]) -> str:
    """Fetch context from all configured retrieval sources and return a formatted block."""
    parts: list[str] = []
    loop = asyncio.get_running_loop()
    for src in sources:
        kind = src.get("kind", "")
        name = src.get("name", "source")
        cfg = src.get("config", {}) or {}
        try:
            if kind == "http_api":
                url = cfg.get("url", "")
                if not url:
                    continue
                params = cfg.get("params") or {}
                if params:
                    url = f"{url}?{urllib.parse.urlencode({k: v for k, v in params.items() if v})}"
                headers: dict[str, str] = {}
                if cfg.get("auth_header") and cfg.get("auth_value"):
                    headers[cfg["auth_header"]] = cfg["auth_value"]
                method = cfg.get("method", "GET").upper()
                req = urllib.request.Request(url, headers=headers, method=method)
                raw = await loop.run_in_executor(
                    None,
                    lambda r=req: urllib.request.urlopen(r, timeout=8).read().decode("utf-8", errors="replace")[:3000],
                )
                parts.append(f"[{name}]\n{raw}")
            elif kind == "json_set":
                data = cfg.get("data")
                if data is not None:
                    parts.append(f"[{name}]\n{json.dumps(data, default=str)[:3000]}")
        except Exception as exc:
            logger.warning("agent_source_fetch_error source_id=%s error=%s", src.get("id"), exc)
    if not parts:
        return ""
    return "\n\nContext from retrieval sources:\n" + "\n\n".join(parts)


class AnthropicAgentRunner(AgentRunnerPort):
    """One global instance — sessions are keyed by session_id UUID."""

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic()
        self._executor = LocalToolExecutor(_PROJECT_DIR)
        self._sessions: dict[str, AgentSession] = {}
        self._session_configs: dict[str, AgentConfig] = {}
        # request_id → asyncio.Future[bool] (True = approved, False = denied)
        self._pending: dict[str, asyncio.Future[bool]] = {}
        self._pending_tool: dict[str, str] = {}   # request_id → tool_name

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def _get_or_create(self, session_id: str) -> AgentSession:
        if session_id not in self._sessions:
            self._sessions[session_id] = AgentSession(
                session_id=session_id,
                project_dir=_PROJECT_DIR,
            )
        return self._sessions[session_id]

    def set_session_config(self, session_id: str, config: AgentConfig) -> None:
        """Called by the WebSocket endpoint after loading config from DB on connect."""
        self._session_configs[session_id] = config

    # ------------------------------------------------------------------
    # AgentRunnerPort
    # ------------------------------------------------------------------

    async def approve(
        self,
        session_id: str,  # noqa: ARG002 — kept for future per-session scoping
        request_id: str,
        approved: bool,
        always: bool = False,
    ) -> None:
        if always and approved:
            tool_name = self._pending_tool.get(request_id)
            session = self._sessions.get(session_id)
            if tool_name and session:
                session.allow_tool_always(tool_name)

        self._pending_tool.pop(request_id, None)
        fut = self._pending.pop(request_id, None)
        if fut and not fut.done():
            fut.set_result(approved)

    async def run_turn(self, session_id: str, user_text: str) -> AsyncIterator[AgentEvent]:  # type: ignore[override]
        config = self._session_configs.get(session_id) or AgentConfig()
        model = config.model
        system = config.resolved_system_prompt(_PROJECT_DIR)
        working_mode = config.working_mode

        # Fetch retrieval-source context and prepend to the user message
        source_context = await _fetch_sources_context(config.sources) if config.sources else ""
        augmented_text = f"{source_context}\n\nUser: {user_text}" if source_context else user_text

        session = self._get_or_create(session_id)
        session.add_message("user", augmented_text)
        total_tokens = 0

        for tool in config.auto_allow_tools:
            session.allow_tool_always(tool)

        # Checkpoint: rollback here if the turn fails or is cancelled mid-way,
        # so the next turn does not see an incomplete tool_use/tool_result pair.
        checkpoint = len(session.messages)
        # Track request_ids created this turn so we can clean up in finally.
        turn_request_ids: list[str] = []
        turn_complete = False

        try:
            # The model may loop: respond → tool_use → respond → … → end_turn
            while True:
                messages = [
                    {"role": m.role, "content": m.content}
                    for m in session.messages
                ]

                async with self._client.messages.stream(
                    model=model,
                    max_tokens=8096,
                    system=system,
                    tools=_TOOLS,
                    messages=messages,
                ) as stream:
                    async for text in stream.text_stream:
                        yield TextDeltaEvent(text=text)

                    final = await stream.get_final_message()

                total_tokens += final.usage.input_tokens + final.usage.output_tokens

                # exclude_none=True avoids sending extra None fields (e.g. citations
                # in newer TextBlock versions) that the API would reject.
                session.add_message(
                    "assistant",
                    [b.model_dump(exclude_none=True) for b in final.content],
                )

                logger.info(
                    "agent_turn",
                    extra={
                        "session_id": session_id,
                        "stop_reason": final.stop_reason,
                        "input_tokens": final.usage.input_tokens,
                        "completion_tokens": final.usage.output_tokens,
                        "total_tokens": total_tokens,
                        "model": model,
                    },
                )

                if final.stop_reason == "end_turn":
                    break

                if final.stop_reason == "tool_use":
                    tool_results: list[dict] = []

                    for block in final.content:
                        if block.type != "tool_use":
                            continue

                        tool_name: str = block.name
                        tool_input: dict = block.input
                        request_id = str(uuid.uuid4())
                        display = _tool_display(tool_name, tool_input)

                        if session.is_auto_allowed(tool_name):
                            approved = True
                        else:
                            loop = asyncio.get_running_loop()
                            fut: asyncio.Future[bool] = loop.create_future()
                            self._pending[request_id] = fut
                            self._pending_tool[request_id] = tool_name
                            turn_request_ids.append(request_id)

                            yield ToolPermissionEvent(
                                request_id=request_id,
                                tool=tool_name,
                                display=display,
                                input=tool_input,
                            )
                            # Suspend here — the WebSocket receive loop calls approve()
                            # which sets this future. CancelledError propagates here if
                            # the outer task is cancelled (new user message arrives).
                            approved = await fut

                        if approved:
                            result = await self._executor.execute(
                                tool_name, tool_input, working_mode=working_mode
                            )
                            yield ToolResultEvent(
                                request_id=request_id,
                                tool=tool_name,
                                preview=result[:300],
                                denied=False,
                            )
                        else:
                            result = "Permission denied by user."
                            yield ToolResultEvent(
                                request_id=request_id,
                                tool=tool_name,
                                preview="",
                                denied=True,
                            )

                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            }
                        )

                    session.add_message("user", tool_results)
                else:
                    # Unexpected stop reason (e.g. max_tokens) — stop cleanly
                    break

            turn_complete = True

        except Exception as exc:
            logger.exception("agent_run_turn_error", extra={"session_id": session_id})
            session.messages = session.messages[:checkpoint]
            yield AgentErrorEvent(message=f"{type(exc).__name__}: {exc}")
            return

        finally:
            # Cancel / clean up any approval futures created during this turn.
            # Runs on normal exit, exception, AND CancelledError (task cancelled).
            for req_id in turn_request_ids:
                f = self._pending.pop(req_id, None)
                self._pending_tool.pop(req_id, None)
                if f and not f.done():
                    f.cancel()
            # On cancellation (turn_complete stays False, except Exception not taken),
            # roll back the session so the next turn starts from a consistent state.
            if not turn_complete and len(session.messages) > checkpoint:
                session.messages = session.messages[:checkpoint]

        yield AgentCompleteEvent(total_tokens=total_tokens)
