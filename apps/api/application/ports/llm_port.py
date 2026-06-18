"""LLMPort — the ONLY way the app talks to a model. Keeps core cloud-agnostic.

No provider SDK imports here (CLAUDE.md §3, §8).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class TokenUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str


@dataclass(frozen=True)
class LlmResult:
    text: str
    usage: TokenUsage


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class LlmToolResult:
    text: str
    tool_calls: list[ToolCall]
    usage: TokenUsage


class LLMPort(Protocol):
    async def complete(self, *, system: str, prompt: str, model: str | None = None) -> LlmResult: ...

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult: ...
