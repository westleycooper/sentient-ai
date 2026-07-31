"""Tests for the sentient_domain SME models."""
from sentient_domain.sme import (
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


def test_sme_template_model_fields_default_to_unset():
    t = ftse100_default()
    assert t.default_model is None
    assert t.use_step_models is False


def test_user_visualisation_kind_defaults_to_wave_and_is_independent_of_agent_kind():
    t = ftse100_default()
    assert t.user_visualisation_kind == "wave"

    t = t.model_copy(update={"visualisation_kind": "wave3d", "user_visualisation_kind": "wavecircle"})
    assert t.visualisation_kind == "wave3d"
    assert t.user_visualisation_kind == "wavecircle"


def test_reasoning_step_model_defaults_to_none():
    step = ReasoningStep(id="s1", name="Test", kind=StepKind.REASON)
    assert step.model is None


def test_sme_template_model_fields_round_trip():
    t = ftse100_default()
    t = t.model_copy(update={
        "default_model": "anthropic:claude-sonnet-5",
        "use_step_models": True,
        "steps": [s.model_copy(update={"model": "openai:gpt-5.1"}) for s in t.steps],
    })
    dumped = t.model_dump()
    reloaded = SmeTemplate(**dumped)
    assert reloaded == t


def test_resolve_model_uses_step_override_when_enabled():
    step = ReasoningStep(id="s1", name="Test", kind=StepKind.REASON, model="openai:gpt-5.1")
    t = SmeTemplate(
        id="t", name="T", soul="", steps=[step],
        default_model="anthropic:claude-sonnet-5", use_step_models=True,
    )
    assert t.resolve_model(step) == "openai:gpt-5.1"


def test_resolve_model_falls_back_to_default_when_step_override_disabled():
    step = ReasoningStep(id="s1", name="Test", kind=StepKind.REASON, model="openai:gpt-5.1")
    t = SmeTemplate(
        id="t", name="T", soul="", steps=[step],
        default_model="anthropic:claude-sonnet-5", use_step_models=False,
    )
    assert t.resolve_model(step) == "anthropic:claude-sonnet-5"


def test_resolve_model_returns_none_when_nothing_configured():
    step = ReasoningStep(id="s1", name="Test", kind=StepKind.REASON)
    t = SmeTemplate(id="t", name="T", soul="", steps=[step])
    assert t.resolve_model(step) is None
