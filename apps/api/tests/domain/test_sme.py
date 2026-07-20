"""Tests for the sentinel_domain SME models."""
from sentinel_domain.sme import (
    DEFAULT_TEMPLATES,
    LessonConfig,
    LessonQuestion,
    ReasoningStep,
    SmeTemplate,
    StepKind,
    english_blocks_tutor_default,
    ftse100_default,
    mental_health_default,
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


def test_default_templates_list_has_four():
    assert len(DEFAULT_TEMPLATES) == 4
    ids = {t.id for t in DEFAULT_TEMPLATES}
    assert "ftse100-analyst" in ids
    assert "mental-health-support" in ids
    assert "recruitment-agent" in ids
    assert "english-blocks-tutor" in ids


def test_lesson_config_defaults_to_disabled():
    lesson = LessonConfig()
    assert lesson.enabled is False
    assert lesson.visual_verify is True
    assert lesson.questions == []


def test_sme_template_lesson_defaults_to_disabled():
    t = ftse100_default()
    assert t.lesson.enabled is False


def test_english_blocks_tutor_default_has_lesson_enabled():
    t = english_blocks_tutor_default()
    assert t.id == "english-blocks-tutor"
    assert t.theme_id == "light"
    assert t.lesson.enabled is True
    assert t.lesson.visual_verify is True
    assert t.lesson.questions == []


def test_lesson_question_round_trips():
    q = LessonQuestion(id="q1", title="Whale", question="Spell: whale", answer="whale",
                        image_url="https://example.com/whale.png")
    lesson = LessonConfig(enabled=True, questions=[q])
    dumped = lesson.model_dump()
    reloaded = LessonConfig(**dumped)
    assert reloaded == lesson


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
