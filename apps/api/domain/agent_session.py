"""AgentSession — domain entity for a voice coding-agent session.

Pure Python — no FastAPI, no SDK, no cloud imports (CLAUDE.md §3).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentMessage:
    """One message in the agent conversation history."""
    role: str  # "user" | "assistant"
    content: Any  # str for user text; list[dict] for assistant blocks / tool results


@dataclass
class AgentSession:
    """Per-WebSocket-session entity: message history + per-session tool permissions."""
    session_id: str
    project_dir: str
    messages: list[AgentMessage] = field(default_factory=list)
    # Tools the user has clicked "Allow Always" for this session
    _auto_allowed: set[str] = field(default_factory=set, repr=False)

    def add_message(self, role: str, content: Any) -> None:
        self.messages.append(AgentMessage(role=role, content=content))

    def allow_tool_always(self, tool_name: str) -> None:
        self._auto_allowed.add(tool_name)

    def is_auto_allowed(self, tool_name: str) -> bool:
        return tool_name in self._auto_allowed
