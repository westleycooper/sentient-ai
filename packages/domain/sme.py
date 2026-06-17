"""SME bounded-context definitions. Source of truth for codegen.

Pure declarative domain. NO framework/DB/LLM/cloud imports (see CLAUDE.md §3).
These models export to JSON Schema, which drives the frontend types + hooks.
"""
from __future__ import annotations

from enum import StrEnum
from pydantic import BaseModel, Field


class StepKind(StrEnum):
    RETRIEVE = "retrieve"
    REASON = "reason"
    TOOL_CALL = "tool_call"
    SUMMARISE = "summarise"
    GUARDRAIL_CHECK = "guardrail_check"


class ReasoningStep(BaseModel):
    """One configurable step in an SME workflow. Steps are DATA, compiled to a graph."""
    id: str
    name: str
    kind: StepKind
    # Free-form, kind-specific config (prompt template, source ref, tool name, budget...).
    config: dict = Field(default_factory=dict)
    # Ordering / branching. next_on may map a label -> step id for conditional edges.
    next_default: str | None = None
    next_on: dict[str, str] = Field(default_factory=dict)


class RetrievalSourceKind(StrEnum):
    HTTP_API = "http_api"
    JSON_SET = "json_set"


class RetrievalSourceConfig(BaseModel):
    id: str
    name: str
    kind: RetrievalSourceKind
    # For HTTP_API: url, auth_secret_ref (Key Vault), pagination, schema_map.
    # For JSON_SET: a reference to an uploaded/seeded document set.
    config: dict = Field(default_factory=dict)


class SmeRule(BaseModel):
    """User-editable rule. e.g. tone, refusal policy, citation requirement."""
    id: str
    description: str
    enabled: bool = True


class SmeTemplate(BaseModel):
    """A selectable, cloneable, editable template. Persisted in Postgres.

    `soul` is the system context/persona; `steps` is the multi-reasoning workflow.
    """
    id: str
    name: str
    soul: str  # system context / persona
    steps: list[ReasoningStep]
    sources: list[RetrievalSourceConfig] = Field(default_factory=list)
    rules: list[SmeRule] = Field(default_factory=list)
    is_default: bool = False


def ftse100_default() -> SmeTemplate:
    """The initial FTSE 100 SME default template."""
    return SmeTemplate(
        id="ftse100-analyst",
        name="FTSE 100 Analyst",
        soul=(
            "You are a measured equity analyst focused on FTSE 100 constituents. "
            "You cite sources, distinguish fact from estimate, and never give "
            "personalised financial advice — you provide information for the user "
            "to make their own informed decision."
        ),
        steps=[
            ReasoningStep(id="guard-in", name="Input guardrail", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_personal_advice_solicitation"}, next_default="retrieve"),
            ReasoningStep(id="retrieve", name="Retrieve market data", kind=StepKind.RETRIEVE,
                          config={"source_id": "ftse-http", "top_k": 8}, next_default="reason"),
            ReasoningStep(id="reason", name="Analyse", kind=StepKind.REASON,
                          config={"prompt": "Analyse the retrieved data to answer the question."},
                          next_default="summarise"),
            ReasoningStep(id="summarise", name="Summarise with citations", kind=StepKind.SUMMARISE,
                          config={"require_citations": True}, next_default="guard-out"),
            ReasoningStep(id="guard-out", name="Output guardrail", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_personalised_advice"}),
        ],
        sources=[
            RetrievalSourceConfig(
                id="ftse-http", name="FTSE market data API", kind=RetrievalSourceKind.HTTP_API,
                config={"url_env": "FTSE_API_URL", "auth_secret_ref": "kv:ftse-api-key"},
            ),
        ],
        rules=[
            SmeRule(id="cite", description="Every factual claim must carry a source citation."),
            SmeRule(id="no-advice", description="Never give personalised investment advice."),
        ],
        is_default=True,
    )
