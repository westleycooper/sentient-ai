"""Tests for LlmRouter's dispatch logic. Uses fake per-provider LLMPort stand-ins."""
import pytest

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage
from infrastructure.llm.llm_router import LlmRouter, ProviderNotConfiguredError


class FakeAdapter:
    def __init__(self, name: str):
        self.name = name
        self.received_models: list[str | None] = []

    async def complete(self, *, system, prompt, model=None):
        self.received_models.append(model)
        return LlmResult(text=f"{self.name}:{model}", usage=TokenUsage(1, 1, 2, model or "default"))

    async def complete_with_tools(self, *, system, prompt, tools, model=None):
        self.received_models.append(model)
        return LlmToolResult(text=f"{self.name}:{model}", tool_calls=[], usage=TokenUsage(1, 1, 2, model or "default"))


@pytest.mark.asyncio
async def test_no_model_dispatches_to_default_provider():
    anthropic = FakeAdapter("anthropic")
    router = LlmRouter(adapters={"anthropic": anthropic}, default_provider="anthropic")

    result = await router.complete(system="s", prompt="p")

    assert result.text == "anthropic:None"
    assert anthropic.received_models == [None]


@pytest.mark.asyncio
async def test_namespaced_model_dispatches_to_matching_provider():
    anthropic = FakeAdapter("anthropic")
    openai = FakeAdapter("openai")
    router = LlmRouter(adapters={"anthropic": anthropic, "openai": openai})

    result = await router.complete(system="s", prompt="p", model="openai:gpt-5.6-terra")

    assert result.text == "openai:gpt-5.6-terra"
    assert openai.received_models == ["gpt-5.6-terra"]
    assert anthropic.received_models == []


@pytest.mark.asyncio
async def test_ollama_model_splits_on_first_colon_only():
    ollama = FakeAdapter("ollama")
    router = LlmRouter(adapters={"anthropic": FakeAdapter("anthropic"), "ollama": ollama})

    result = await router.complete(system="s", prompt="p", model="ollama:gemma3:12b")

    assert result.text == "ollama:gemma3:12b"
    assert ollama.received_models == ["gemma3:12b"]


@pytest.mark.asyncio
async def test_unconfigured_provider_raises():
    router = LlmRouter(adapters={"anthropic": FakeAdapter("anthropic")})

    with pytest.raises(ProviderNotConfiguredError):
        await router.complete(system="s", prompt="p", model="openai:gpt-5.6-terra")


@pytest.mark.asyncio
async def test_complete_with_tools_dispatches_same_as_complete():
    ollama = FakeAdapter("ollama")
    router = LlmRouter(adapters={"anthropic": FakeAdapter("anthropic"), "ollama": ollama})

    result = await router.complete_with_tools(system="s", prompt="p", tools=[], model="ollama:gemma3:12b")

    assert result.text == "ollama:gemma3:12b"
    assert ollama.received_models == ["gemma3:12b"]
