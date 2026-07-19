"""AgentRunnerPort and ToolExecutorPort — abstract boundaries for the coding agent.

Only dataclasses and ABCs here; no cloud SDK imports (CLAUDE.md §3).
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator


# ---------------------------------------------------------------------------
# Event dataclasses — server → client over WebSocket
# ---------------------------------------------------------------------------

@dataclass
class TextDeltaEvent:
    type: str = "text_delta"
    text: str = ""

    def as_dict(self) -> dict:
        return {"type": self.type, "text": self.text}


@dataclass
class ToolPermissionEvent:
    """Sent when the agent wants to invoke a tool and needs user approval."""
    type: str = "tool_permission"
    request_id: str = ""
    tool: str = ""
    display: str = ""
    input: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "type": self.type,
            "request_id": self.request_id,
            "tool": self.tool,
            "display": self.display,
            "input": self.input,
        }


@dataclass
class ToolResultEvent:
    """Sent after a tool executes (or is denied)."""
    type: str = "tool_result"
    request_id: str = ""
    tool: str = ""
    preview: str = ""
    denied: bool = False

    def as_dict(self) -> dict:
        return {
            "type": self.type,
            "request_id": self.request_id,
            "tool": self.tool,
            "preview": self.preview,
            "denied": self.denied,
        }


@dataclass
class AgentCompleteEvent:
    type: str = "complete"
    total_tokens: int = 0

    def as_dict(self) -> dict:
        return {"type": self.type, "total_tokens": self.total_tokens}


@dataclass
class AgentErrorEvent:
    type: str = "error"
    message: str = ""

    def as_dict(self) -> dict:
        return {"type": self.type, "message": self.message}


AgentEvent = TextDeltaEvent | ToolPermissionEvent | ToolResultEvent | AgentCompleteEvent | AgentErrorEvent


# ---------------------------------------------------------------------------
# Ports
# ---------------------------------------------------------------------------

class ToolExecutorPort(ABC):
    """Executes tool calls on behalf of the agent. Adapter lives in infrastructure."""

    @abstractmethod
    async def execute(self, tool_name: str, tool_input: dict[str, Any]) -> str: ...


class AgentRunnerPort(ABC):
    """Manages agent sessions and streams turn events. Adapter in infrastructure."""

    @abstractmethod
    async def run_turn(self, session_id: str, user_text: str) -> AsyncIterator[AgentEvent]: ...

    @abstractmethod
    async def approve(
        self,
        session_id: str,
        request_id: str,
        approved: bool,
        always: bool = False,
    ) -> None: ...
