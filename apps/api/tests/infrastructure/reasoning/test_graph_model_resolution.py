"""Tests that build_graph() resolves the right model per step/guardrail via
SmeTemplate.resolve_model(), using a fake LLMPort that records the `model`
kwarg it was called with.
"""
import pytest
from langgraph.checkpoint.memory import InMemorySaver
from sentient_domain.sme import ReasoningStep, SmeTemplate, StepKind

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage
from infrastructure.reasoning.graph import build_graph


class FakeLlm:
    def __init__(self):
        self.calls: list[str | None] = []

    async def complete(self, *, system, prompt, model=None):
        self.calls.append(model)
        return LlmResult(text="PASS\nok", usage=TokenUsage(1, 1, 2, model or "default"))

    async def complete_with_tools(self, *, system, prompt, tools, model=None):
        self.calls.append(model)
        return LlmToolResult(text="", tool_calls=[], usage=TokenUsage(1, 1, 2, model or "default"))


class FakeRetriever:
    async def retrieve(self, *, query, top_k):
        return []


def _sme_with_step_overrides() -> SmeTemplate:
    return SmeTemplate(
        id="t",
        name="T",
        soul="soul",
        default_model="anthropic:claude-sonnet-5",
        use_step_models=True,
        steps=[
            ReasoningStep(id="guard-in", name="Guard in", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_profanity"}),
            ReasoningStep(id="reason", name="Reason", kind=StepKind.REASON,
                          model="openai:gpt-5.6-terra"),
            ReasoningStep(id="tool", name="Tool", kind=StepKind.TOOL_CALL,
                          model="ollama:gemma3:12b"),
            ReasoningStep(id="summarise", name="Summarise", kind=StepKind.SUMMARISE,
                          config={"format": "bullet_points"}),
            ReasoningStep(id="guard-out", name="Guard out", kind=StepKind.GUARDRAIL_CHECK,
                          config={"check": "no_harmful_content"}),
        ],
    )


@pytest.mark.asyncio
async def test_each_step_and_guardrail_uses_its_resolved_model():
    llm = FakeLlm()
    sme = _sme_with_step_overrides()
    graph = build_graph(llm=llm, retriever=FakeRetriever(), checkpointer=InMemorySaver(), sme_template=sme)

    await graph.ainvoke(
        {"conversation_id": "c1", "sme_id": sme.id, "soul": sme.soul, "question": "hi"},
        config={"configurable": {"thread_id": "c1"}},
    )

    # guard-in, guard-out both use no_profanity -> default_model; reason -> its
    # own override; tool -> its own override; summarise has no override -> default_model
    assert llm.calls == [
        "anthropic:claude-sonnet-5",  # guard-in
        "openai:gpt-5.6-terra",       # reason
        "ollama:gemma3:12b",          # tool
        "anthropic:claude-sonnet-5",  # summarise (no per-step override)
        "anthropic:claude-sonnet-5",  # guard-out
    ]


@pytest.mark.asyncio
async def test_step_override_ignored_when_use_step_models_disabled():
    llm = FakeLlm()
    sme = _sme_with_step_overrides().model_copy(update={"use_step_models": False})
    graph = build_graph(llm=llm, retriever=FakeRetriever(), checkpointer=InMemorySaver(), sme_template=sme)

    await graph.ainvoke(
        {"conversation_id": "c2", "sme_id": sme.id, "soul": sme.soul, "question": "hi"},
        config={"configurable": {"thread_id": "c2"}},
    )

    # every call falls back to default_model even though steps have their own `model` set
    assert llm.calls == ["anthropic:claude-sonnet-5"] * 5


@pytest.mark.asyncio
async def test_falls_back_to_env_constant_when_nothing_configured():
    llm = FakeLlm()
    sme = SmeTemplate(
        id="t2", name="T2", soul="soul",
        steps=[ReasoningStep(id="reason", name="Reason", kind=StepKind.REASON)],
    )
    graph = build_graph(llm=llm, retriever=FakeRetriever(), checkpointer=InMemorySaver(), sme_template=sme)

    await graph.ainvoke(
        {"conversation_id": "c3", "sme_id": sme.id, "soul": sme.soul, "question": "hi"},
        config={"configurable": {"thread_id": "c3"}},
    )

    assert llm.calls == ["claude-haiku-4-5-20251001"]
