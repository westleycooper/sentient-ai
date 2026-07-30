"""GoogleLlmAdapter — LLMPort implementation using the google-genai SDK.

The one genuinely new dependency this feature adds (`google-genai`) —
Anthropic and OpenAI SDKs are already present in this repo for other
features. Reads GOOGLE_API_KEY, falling back to GEMINI_API_KEY.
"""
from __future__ import annotations

import os

from google import genai
from google.genai import types

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage, ToolCall


def _api_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise KeyError("GOOGLE_API_KEY (or GEMINI_API_KEY) is not set")
    return key


class GoogleLlmAdapter:
    def __init__(self, *, model: str | None = None) -> None:
        self._default_model = model or os.environ.get("GOOGLE_LLM_MODEL", "gemini-3.5-flash")
        self._client = genai.Client(api_key=_api_key())

    @staticmethod
    def _usage(response) -> tuple[int, int, int]:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return 0, 0, 0
        prompt = getattr(usage, "prompt_token_count", 0) or 0
        completion = getattr(usage, "candidates_token_count", 0) or 0
        total = getattr(usage, "total_token_count", 0) or (prompt + completion)
        return prompt, completion, total

    async def complete(
        self, *, system: str, prompt: str, model: str | None = None
    ) -> LlmResult:
        resolved_model = model or self._default_model
        response = await self._client.aio.models.generate_content(
            model=resolved_model,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system),
        )
        prompt_tokens, completion_tokens, total_tokens = self._usage(response)
        return LlmResult(
            text=response.text or "",
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                model=resolved_model,
            ),
        )

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult:
        resolved_model = model or self._default_model
        function_declarations = [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
            }
            for t in tools
        ]
        response = await self._client.aio.models.generate_content(
            model=resolved_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                tools=[types.Tool(function_declarations=function_declarations)],
            ),
        )
        prompt_tokens, completion_tokens, total_tokens = self._usage(response)

        tool_calls = []
        for fc in getattr(response, "function_calls", None) or []:
            tool_calls.append(ToolCall(id=fc.name, name=fc.name, input=dict(fc.args or {})))

        return LlmToolResult(
            text=response.text or "",
            tool_calls=tool_calls,
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                model=resolved_model,
            ),
        )
