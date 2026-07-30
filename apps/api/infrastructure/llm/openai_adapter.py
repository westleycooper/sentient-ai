"""OpenAiLlmAdapter — LLMPort implementation using the raw OpenAI SDK.

Uses AsyncOpenAI directly (not langchain-openai) — `openai` is already a
pinned dependency for STT/TTS, so this adds zero new dependencies.
"""
from __future__ import annotations

import json
import os

from openai import AsyncOpenAI

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage, ToolCall


class OpenAiLlmAdapter:
    def __init__(self, *, model: str | None = None) -> None:
        self._default_model = model or os.environ.get("OPENAI_LLM_MODEL", "gpt-5.6-terra")
        self._api_key = os.environ["OPENAI_API_KEY"]
        self._clients: dict[str, AsyncOpenAI] = {}

    def _client(self) -> AsyncOpenAI:
        # A single client instance is reused across models — model is a per-call
        # parameter to the OpenAI API, not something baked into the client.
        if "default" not in self._clients:
            self._clients["default"] = AsyncOpenAI(api_key=self._api_key)
        return self._clients["default"]

    async def complete(
        self, *, system: str, prompt: str, model: str | None = None
    ) -> LlmResult:
        resolved_model = model or self._default_model
        response = await self._client().chat.completions.create(
            model=resolved_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        )
        usage = response.usage
        return LlmResult(
            text=response.choices[0].message.content or "",
            usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
                model=resolved_model,
            ),
        )

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult:
        resolved_model = model or self._default_model
        oai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
                },
            }
            for t in tools
        ]
        response = await self._client().chat.completions.create(
            model=resolved_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            tools=oai_tools,
        )
        message = response.choices[0].message
        usage = response.usage

        tool_calls = []
        for tc in message.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments)
            except (json.JSONDecodeError, TypeError):
                args = {}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, input=args))

        return LlmToolResult(
            text=message.content or "",
            tool_calls=tool_calls,
            usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
                model=resolved_model,
            ),
        )
