"""Typed LangGraph state + reasoning step events (CLAUDE.md §4, §10)."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, TypedDict


@dataclass
class ReasoningStepEvent:
    step_id: str
    step_name: str
    phase: str            # "started" | "finished"
    latency_ms: float | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str | None = None
    estimated_cost: float = 0.0
    output_preview: str | None = None   # PII-redacted preview only


class ConversationState(TypedDict, total=False):
    conversation_id: str
    sme_id: str
    soul: str              # SME persona/system prompt — injected from template
    question: str
    retrieved: list[dict[str, Any]]   # provenance-carrying chunks
    analysis: str
    answer: str
    citations: list[dict[str, Any]]
    events: list[ReasoningStepEvent]
    token_total: int
    blocked: bool
