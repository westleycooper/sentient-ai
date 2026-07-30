"""LlmRouter — a composite LLMPort that dispatches to the right provider
adapter based on a namespaced model id ("provider:model-id").

This is the seam that lets every other LLMPort caller (GraphRunner,
build_graph, guardrail_executor) stay completely unchanged: the router
itself implements LLMPort, so swapping it in at the DI layer is all that's
needed for multi-provider + local-model support. See ADR-0005.
"""
from __future__ import annotations

from sentient_domain.model_ref import parse_model_ref

from application.ports.llm_port import LLMPort, LlmResult, LlmToolResult


class ProviderNotConfiguredError(RuntimeError):
    """Raised when a step references a provider with no configured adapter
    (e.g. `openai:...` with no OPENAI_API_KEY set). This is a config error,
    not a transient condition, so it's surfaced immediately rather than
    silently falling back to a different model."""

    def __init__(self, provider: str, model: str) -> None:
        super().__init__(
            f"Model '{model}' references provider '{provider}', which is not configured "
            f"on this deployment (missing API key or adapter)."
        )
        self.provider = provider
        self.model = model


class LlmRouter:
    def __init__(self, *, adapters: dict[str, LLMPort], default_provider: str = "anthropic") -> None:
        self._adapters = adapters
        self._default_provider = default_provider

    def _resolve(self, model: str | None) -> tuple[LLMPort, str | None]:
        if model is None:
            return self._adapters[self._default_provider], None
        provider, model_id = parse_model_ref(model)
        adapter = self._adapters.get(provider)
        if adapter is None:
            raise ProviderNotConfiguredError(provider, model)
        return adapter, model_id

    async def complete(self, *, system: str, prompt: str, model: str | None = None) -> LlmResult:
        adapter, model_id = self._resolve(model)
        return await adapter.complete(system=system, prompt=prompt, model=model_id)

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult:
        adapter, model_id = self._resolve(model)
        return await adapter.complete_with_tools(system=system, prompt=prompt, tools=tools, model=model_id)
