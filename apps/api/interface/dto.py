"""Request/Response DTOs for the FastAPI interface. Pydantic v2. (CLAUDE.md §7)"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from sentinel_domain.sme import SmeTemplate


# --- SME ---

class SmeTemplateResponse(BaseModel):
    id: str
    name: str
    soul: str
    steps: list[dict]
    sources: list[dict]
    rules: list[dict]
    is_default: bool
    visualisation_kind: str = "wave"

    @classmethod
    def from_domain(cls, t: SmeTemplate) -> "SmeTemplateResponse":
        return cls(
            id=t.id,
            name=t.name,
            soul=t.soul,
            steps=[s.model_dump() for s in t.steps],
            sources=[s.model_dump() for s in t.sources],
            rules=[r.model_dump() for r in t.rules],
            is_default=t.is_default,
            visualisation_kind=t.visualisation_kind,
        )


class SaveSmeTemplateRequest(BaseModel):
    id: str
    name: str
    soul: str
    steps: list[dict] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    rules: list[dict] = Field(default_factory=list)
    is_default: bool = False
    visualisation_kind: str = "wave"


# --- Conversations ---

class StartConversationRequest(BaseModel):
    sme_id: str


class StartConversationResponse(BaseModel):
    conversation_id: str
    sme_id: str
    created_at: datetime


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    token_count: int
    citations: list[dict[str, Any]]


class ConversationResponse(BaseModel):
    id: str
    sme_id: str
    created_at: datetime
    messages: list[MessageResponse]


# --- Streaming turn ---

class TurnRequest(BaseModel):
    user_text: str


class ReasoningStepEventResponse(BaseModel):
    """Emitted over SSE for each graph node completion."""
    type: str = "step"
    step_id: str
    step_name: str
    phase: str
    latency_ms: float | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str | None = None
    estimated_cost: float = 0.0
    output_preview: str | None = None


class TurnCompleteEventResponse(BaseModel):
    type: str = "complete"
    answer: str
    total_tokens: int
    citations: list[dict[str, Any]] = Field(default_factory=list)


class TurnErrorEventResponse(BaseModel):
    type: str = "error"
    message: str


# --- Audio ---

class TranscribeResponse(BaseModel):
    transcript: str
