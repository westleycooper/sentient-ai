"""Named guardrail registry. Pure domain — no framework/LLM imports (CLAUDE.md §3)."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class GuardrailDefinition:
    id: str
    display_name: str
    description: str
    phase: Literal["input", "output"]


GUARDRAIL_REGISTRY: dict[str, GuardrailDefinition] = {
    # Financial
    "no_personal_advice_solicitation": GuardrailDefinition(
        id="no_personal_advice_solicitation",
        display_name="No personal advice solicitation",
        description="Rejects requests that seek personalised financial or investment advice.",
        phase="input",
    ),
    "no_personalised_advice": GuardrailDefinition(
        id="no_personalised_advice",
        display_name="No personalised advice in output",
        description="Ensures the response does not constitute personalised investment advice.",
        phase="output",
    ),
    # Mental health
    "crisis_detection": GuardrailDefinition(
        id="crisis_detection",
        display_name="Crisis detection",
        description="Detects indicators of self-harm, suicidal ideation, or immediate danger.",
        phase="input",
    ),
    "no_harmful_content": GuardrailDefinition(
        id="no_harmful_content",
        display_name="No harmful content",
        description="Ensures the response contains nothing that could harm a vulnerable user.",
        phase="output",
    ),
    # Recruitment / general
    "no_protected_characteristics": GuardrailDefinition(
        id="no_protected_characteristics",
        display_name="No protected characteristics",
        description="Ensures the response makes no inappropriate reference to age, gender, ethnicity, religion, or other protected characteristics.",
        phase="output",
    ),
    "constructive_tone": GuardrailDefinition(
        id="constructive_tone",
        display_name="Constructive tone",
        description="Ensures feedback is framed constructively rather than negatively.",
        phase="output",
    ),
    "no_profanity": GuardrailDefinition(
        id="no_profanity",
        display_name="No profanity",
        description="Rejects input or output containing profane or abusive language.",
        phase="input",
    ),
    "no_off_topic": GuardrailDefinition(
        id="no_off_topic",
        display_name="No off-topic queries",
        description="Rejects queries that fall clearly outside the SME domain.",
        phase="input",
    ),
}
