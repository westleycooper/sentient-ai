"""SME bounded-context definitions. Source of truth for codegen.

Pure declarative domain. NO framework/DB/LLM/cloud imports (see CLAUDE.md §3).
These models export to JSON Schema, which drives the frontend types + hooks.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Literal
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
    config: dict = Field(default_factory=dict)
    next_default: str | None = None
    next_on: dict[str, str] = Field(default_factory=dict)
    model: str | None = None
    """Namespaced model id (e.g. "openai:gpt-5.1", "ollama:gemma3:12b") overriding
    the template default for this step. Only used when the template's
    `use_step_models` is enabled; ignored otherwise."""


class RetrievalSourceKind(StrEnum):
    HTTP_API = "http_api"
    JSON_SET = "json_set"


class RetrievalSourceConfig(BaseModel):
    id: str
    name: str
    kind: RetrievalSourceKind
    config: dict = Field(default_factory=dict)


class SmeRule(BaseModel):
    """User-editable rule. e.g. tone, refusal policy, citation requirement."""
    id: str
    description: str
    enabled: bool = True


class LessonQuestion(BaseModel):
    """One question in a Lesson: a prompt the user answers by spelling with blocks."""
    id: str
    title: str
    question: str
    answer: str
    image_url: str | None = None


class LessonConfig(BaseModel):
    """Optional Lesson feature switch. Disabled by default on every SME; any
    persona can opt in and configure questions via the same editor UI used
    for steps/rules/sources."""
    enabled: bool = False
    visual_verify: bool = True
    questions: list[LessonQuestion] = Field(default_factory=list)


class SmeTemplate(BaseModel):
    """A selectable, cloneable, editable template. Persisted in Postgres.

    `soul` is the system context/persona; `steps` is the multi-reasoning workflow.
    """
    id: str
    name: str
    soul: str
    steps: list[ReasoningStep]
    sources: list[RetrievalSourceConfig] = Field(default_factory=list)
    rules: list[SmeRule] = Field(default_factory=list)
    is_default: bool = False
    visualisation_kind: Literal["wave", "wavecircle", "wave3d", "wave3dgrid", "wavehead"] = "wave"
    """Visualisation shown for the agent's spoken response (the main view)."""
    user_visualisation_kind: Literal["wave", "wavecircle", "wave3d", "wave3dgrid", "wavehead"] = "wave"
    """Visualisation shown for the user's own mic input (the small view next
    to the mic button). Independent of `visualisation_kind` — an SME can pair
    any agent visual with any user visual."""
    theme_id: str = "dark-teal"
    lesson: LessonConfig = Field(default_factory=LessonConfig)
    default_model: str | None = None
    """Namespaced model id (e.g. "anthropic:claude-sonnet-5") used for every
    LLM-calling step unless `use_step_models` is enabled and a step overrides
    it. `None` defers to the platform's zero-config default."""
    use_step_models: bool = False
    """When True, individual steps may use `ReasoningStep.model` instead of
    `default_model`. When False (the default), every step shares `default_model`
    — today's behaviour."""

    def model_json_schema_export(self) -> dict:
        return self.model_json_schema()

    def resolve_model(self, step: ReasoningStep) -> str | None:
        """Which namespaced model id a given step should use, or None if
        nothing is configured (caller falls back to its own env-var default).
        """
        if self.use_step_models and step.model:
            return step.model
        return self.default_model


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
                id="yahoo-ftse",
                name="Yahoo Finance — FTSE 100 Index",
                kind=RetrievalSourceKind.HTTP_API,
                config={
                    "url": "https://query1.finance.yahoo.com/v8/finance/chart/%5EFTSE",
                    "method": "GET",
                    "params": {"interval": "1d", "range": "5d"},
                    "auth_header": "",
                    "auth_value": "",
                },
            ),
            RetrievalSourceConfig(
                id="yahoo-ftse-stocks",
                name="Yahoo Finance — Top 10 FTSE 100 Stocks",
                kind=RetrievalSourceKind.HTTP_API,
                config={
                    "url_template": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
                    "tickers": [
                        "AZN.L", "SHEL.L", "HSBA.L", "ULVR.L", "BP.L",
                        "RIO.L", "GSK.L", "BATS.L", "DGE.L", "GLEN.L",
                    ],
                    "method": "GET",
                    "params": {"interval": "1d", "range": "1d"},
                },
            ),
        ],
        rules=[
            SmeRule(id="cite", description="Every factual claim must carry a source citation."),
            SmeRule(id="no-advice", description="Never give personalised investment advice."),
        ],
        is_default=True,
    )


def mental_health_default() -> SmeTemplate:
    return SmeTemplate(
        id="mental-health-support",
        name="Mental Health Support",
        soul=(
            "You are a compassionate, non-judgemental mental health support companion. "
            "You listen actively, validate feelings, and suggest evidence-based coping strategies. "
            "You always signpost professional services when the user may be at risk. "
            "You never diagnose or replace professional medical advice."
        ),
        steps=[
            ReasoningStep(id="guard-in", name="Safety guardrail", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "crisis_detection"}, next_default="reason"),
            ReasoningStep(id="reason", name="Empathic reasoning", kind=StepKind.REASON,
                          config={"prompt": "Respond with empathy and practical support."}, next_default="guard-out"),
            ReasoningStep(id="guard-out", name="Output safety check", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_harmful_content"}),
        ],
        rules=[
            SmeRule(id="signpost", description="Always signpost professional services for crisis situations."),
            SmeRule(id="no-diagnosis", description="Never diagnose medical conditions."),
        ],
        is_default=False,
    )


def recruitment_default() -> SmeTemplate:
    return SmeTemplate(
        id="recruitment-agent",
        name="Recruitment Agent",
        soul=(
            "You are an expert talent acquisition specialist. You help candidates prepare for "
            "interviews, review CVs, discuss career paths, and explain hiring processes. "
            "You are encouraging, constructive, and honest about skill gaps."
        ),
        steps=[
            ReasoningStep(id="guard-in", name="Profanity check", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_profanity"}, next_default="retrieve"),
            ReasoningStep(id="retrieve", name="Retrieve live jobs", kind=StepKind.RETRIEVE,
                          config={"source_id": "remotive-jobs", "top_k": 8}, next_default="reason"),
            ReasoningStep(id="reason", name="Career analysis", kind=StepKind.REASON,
                          config={"prompt": "Provide actionable career guidance."}, next_default="summarise"),
            ReasoningStep(id="summarise", name="Structured advice", kind=StepKind.SUMMARISE,
                          config={"format": "bullet_points"}),
            ReasoningStep(id="guard-out-bias", name="Bias check", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_protected_characteristics"}),
            ReasoningStep(id="guard-out-tone", name="Tone check", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "constructive_tone"}),
        ],
        sources=[
            RetrievalSourceConfig(
                id="remotive-jobs",
                name="Remotive — Remote Jobs (free, no key)",
                kind=RetrievalSourceKind.HTTP_API,
                config={
                    "url": "https://remotive.com/api/remote-jobs",
                    "method": "GET",
                    "params": {"limit": "20"},
                    "auth_header": "",
                    "auth_value": "",
                },
            ),
        ],
        rules=[
            SmeRule(id="constructive", description="Always frame feedback constructively."),
            SmeRule(id="no-bias", description="Never comment on protected characteristics."),
        ],
        is_default=False,
    )


def english_blocks_tutor_default() -> SmeTemplate:
    return SmeTemplate(
        id="english-blocks-tutor",
        name="English Blocks Tutor",
        soul=(
            "You are a warm, encouraging phonics and spelling tutor for young "
            "children, working alongside a physical set of about 40 double-sided "
            "letter blocks (roughly two of each common letter, single copies of "
            "rarer letters like Q, X, Z, J). You speak simply, praise effort, and "
            "break words into sounds (phonics/blends) to help the child find the "
            "right blocks. During a lesson you introduce each word, help the child "
            "sound it out, and wait for them to show their spelling to the camera."
        ),
        steps=[
            ReasoningStep(id="reason", name="Friendly phonics chat", kind=StepKind.REASON,
                          config={"prompt": "Respond warmly and simply; break words into sounds when asked."}),
        ],
        rules=[
            SmeRule(id="simple-language", description="Use short, simple sentences a young child can follow."),
            SmeRule(id="encouraging", description="Always praise effort before correcting mistakes."),
        ],
        is_default=False,
        visualisation_kind="wave",
        theme_id="light",
        lesson=LessonConfig(enabled=True, visual_verify=True, questions=[]),
    )


DEFAULT_TEMPLATES: list[SmeTemplate] = [
    ftse100_default(),
    mental_health_default(),
    recruitment_default(),
    english_blocks_tutor_default(),
]
