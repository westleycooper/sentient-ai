"""Tests for the sentinel_domain SME models."""
from sentinel_domain.sme import (
    DEFAULT_TEMPLATES,
    StepKind,
    SmeTemplate,
    ReasoningStep,
    ftse100_default,
    mental_health_default,
    recruitment_default,
)


def test_ftse100_default_has_expected_shape():
    t = ftse100_default()
    assert t.id == "ftse100-analyst"
    assert t.is_default is True
    assert any(s.kind == StepKind.RETRIEVE for s in t.steps)
    assert any(s.kind == StepKind.GUARDRAIL_CHECK for s in t.steps)
    assert len(t.rules) >= 2


def test_mental_health_default_has_safety_guardrail():
    t = mental_health_default()
    assert any(s.kind == StepKind.GUARDRAIL_CHECK for s in t.steps)


def test_default_templates_list_has_three():
    assert len(DEFAULT_TEMPLATES) == 3
    ids = {t.id for t in DEFAULT_TEMPLATES}
    assert "ftse100-analyst" in ids
    assert "mental-health-support" in ids
    assert "recruitment-agent" in ids


def test_sme_template_serialises_to_json():
    t = ftse100_default()
    dumped = t.model_dump()
    assert dumped["id"] == "ftse100-analyst"
    assert isinstance(dumped["steps"], list)
    reloaded = SmeTemplate(**dumped)
    assert reloaded == t


def test_reasoning_step_next_on_defaults_empty():
    step = ReasoningStep(id="s1", name="Test", kind=StepKind.REASON)
    assert step.next_on == {}
    assert step.next_default is None
