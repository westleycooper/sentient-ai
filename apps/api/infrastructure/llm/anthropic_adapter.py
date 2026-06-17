"""AnthropicLlmAdapter — LLMPort implementation using langchain-anthropic.

Langchain is a permitted building block here (infrastructure layer).
The application layer only sees LLMPort — no Anthropic SDK leaks inward.
"""
from __future__ import annotations

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from application.ports.llm_port import LlmResult, TokenUsage


class AnthropicLlmAdapter:
    def __init__(self, *, model: str | None = None) -> None:
        self._default_model = model or os.environ.get(
            "LLM_MODEL", "claude-sonnet-4-6"
        )
        self._client = ChatAnthropic(
            model=self._default_model,
            api_key=os.environ["ANTHROPIC_API_KEY"],
        )

    async def complete(
        self, *, system: str, prompt: str, model: str | None = None
    ) -> LlmResult:
        client = (
            self._client
            if model is None or model == self._default_model
            else ChatAnthropic(model=model, api_key=os.environ["ANTHROPIC_API_KEY"])
        )
        messages = [SystemMessage(content=system), HumanMessage(content=prompt)]
        response = await client.ainvoke(messages)
        usage = response.usage_metadata or {}
        return LlmResult(
            text=str(response.content),
            usage=TokenUsage(
                prompt_tokens=usage.get("input_tokens", 0),
                completion_tokens=usage.get("output_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model=model or self._default_model,
            ),
        )
