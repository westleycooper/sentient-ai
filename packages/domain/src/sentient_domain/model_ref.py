"""Parsing for namespaced model-id strings ("provider:model-id").

Pure string logic, no I/O — lives in domain so both `SmeTemplate` (domain)
and the LLM adapter routing (infrastructure) can share it without domain
reaching outward for it.
"""
from __future__ import annotations


def parse_model_ref(ref: str) -> tuple[str, str]:
    """Split a namespaced model id on its FIRST colon only.

    Ollama's own tags already contain a colon (e.g. "gemma3:12b"), so a naive
    split-on-all-colons would break "ollama:gemma3:12b" into three parts.
    A bare id with no provider prefix (today's zero-config env-var defaults,
    e.g. "claude-haiku-4-5-20251001") is treated as an Anthropic model — this
    lets existing unqualified model strings keep working unchanged.
    """
    provider, sep, model_id = ref.partition(":")
    return (provider, model_id) if sep else ("anthropic", ref)
