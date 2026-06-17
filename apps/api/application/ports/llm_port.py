"""LLMPort — the ONLY way the app talks to a model. Keeps core cloud-agnostic.

No provider SDK imports here (CLAUDE.md §3, §8).
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol


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


class LLMPort(Protocol):
    async def complete(self, *, system: str, prompt: str, model: str | None = None) -> LlmResult: ...
