"""OllamaLlmAdapter — LLMPort implementation talking to a local Ollama daemon
over its plain REST API. Plain httpx (already a dependency) — no new SDK.

Note: Ollama's /api/chat response has no OpenAI-style `usage` object — token
counts come back as top-level `prompt_eval_count`/`eval_count` fields, which
must be mapped explicitly into TokenUsage.

Connection errors propagate as ordinary exceptions — the reasoning-graph call
sites already handle LLM call failures (tool-call node's `except Exception`,
guardrail's fail-open `except Exception`), so no extra graceful-degradation
logic belongs here. (Contrast with OllamaRuntimeAdapter, used for the
browse/health-check UI path, which must never raise for "not running.")
"""
from __future__ import annotations

import json
import os

import httpx

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage, ToolCall


class OllamaLlmAdapter:
    def __init__(self, *, base_url: str | None = None) -> None:
        self._base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

    def _usage(self, data: dict, model: str) -> TokenUsage:
        prompt_tokens = data.get("prompt_eval_count", 0) or 0
        completion_tokens = data.get("eval_count", 0) or 0
        return TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            model=model,
        )

    async def complete(
        self, *, system: str, prompt: str, model: str | None = None
    ) -> LlmResult:
        resolved_model = model or os.environ.get("OLLAMA_LLM_MODEL", "gemma4:e4b")
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": resolved_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
        return LlmResult(
            text=data.get("message", {}).get("content", ""),
            usage=self._usage(data, resolved_model),
        )

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult:
        resolved_model = model or os.environ.get("OLLAMA_LLM_MODEL", "gemma4:e4b")
        ollama_tools = [
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
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": resolved_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "tools": ollama_tools,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()

        message = data.get("message", {})
        tool_calls = []
        for i, tc in enumerate(message.get("tool_calls") or []):
            fn = tc.get("function", {})
            args = fn.get("arguments", {})
            # Ollama usually returns arguments as a dict already, unlike OpenAI's
            # JSON-string convention — handle both defensively.
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            tool_calls.append(ToolCall(id=tc.get("id", str(i)), name=fn.get("name", ""), input=args))

        return LlmToolResult(
            text=message.get("content", ""),
            tool_calls=tool_calls,
            usage=self._usage(data, resolved_model),
        )
