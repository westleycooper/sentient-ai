"""AnthropicLlmAdapter — LLMPort implementation using langchain-anthropic.

Langchain is a permitted building block here (infrastructure layer).
The application layer only sees LLMPort — no Anthropic SDK leaks inward.
"""
from __future__ import annotations

import os

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from application.ports.llm_port import LlmResult, LlmToolResult, TokenUsage, ToolCall


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

    async def complete_with_tools(
        self, *, system: str, prompt: str, tools: list[dict], model: str | None = None
    ) -> LlmToolResult:
        lc_tools = [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "input_schema": t.get("input_schema", {"type": "object", "properties": {}}),
            }
            for t in tools
        ]
        client = (
            self._client if model is None or model == self._default_model
            else ChatAnthropic(model=model, api_key=os.environ["ANTHROPIC_API_KEY"])
        )
        bound = client.bind_tools(lc_tools)
        messages = [SystemMessage(content=system), HumanMessage(content=prompt)]
        response = await bound.ainvoke(messages)
        usage = response.usage_metadata or {}

        # Extract text — content can be a list of blocks when tools are used
        text = ""
        if isinstance(response.content, str):
            text = response.content
        elif isinstance(response.content, list):
            text = " ".join(
                b.get("text", "") if isinstance(b, dict) else str(b)
                for b in response.content
                if not (isinstance(b, dict) and b.get("type") == "tool_use")
            ).strip()

        # Extract tool calls
        tool_calls = []
        if hasattr(response, "tool_calls") and response.tool_calls:
            for tc in response.tool_calls:
                tool_calls.append(ToolCall(
                    id=tc.get("id", ""),
                    name=tc["name"],
                    input=tc.get("args", {}),
                ))

        return LlmToolResult(
            text=text,
            tool_calls=tool_calls,
            usage=TokenUsage(
                prompt_tokens=usage.get("input_tokens", 0),
                completion_tokens=usage.get("output_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
                model=model or self._default_model,
            ),
        )
