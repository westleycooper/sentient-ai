"""Curated frontier-model catalog + recommended local (Ollama) models.

Pure Python constants — no I/O, no SDK imports (CLAUDE.md §3). Mirrors the
existing `agent_config.py::AVAILABLE_MODELS` pattern: a small, hand-maintained
list rather than a live per-provider catalog query (see ADR-0005).

Ids are fully namespaced ("<provider>:<model-id>") so the frontend can pass a
catalog entry's `id` straight through to `SmeTemplate.default_model` /
`ReasoningStep.model` with no further string-building.

These lists go stale as providers ship new models — review and update by hand
periodically rather than relying on this being exhaustive or current. Entries
are real, callable model ids only — provider-side request parameters that
aren't distinct model ids (e.g. OpenAI's reasoning-effort levels: none, low,
medium, high, xhigh, max) aren't represented here, since `LLMPort` has no slot
for them; that would need a separate port-level change if wanted.
"""
from __future__ import annotations

FRONTIER_MODELS: dict[str, list[dict]] = {
    "anthropic": [
        {
            "id": "anthropic:claude-fable-5",
            "label": "Fable 5",
            "description": "Agentic — purpose-built for long multi-step tasks and coding",
        },
        {
            "id": "anthropic:claude-opus-5",
            "label": "Opus 5",
            "description": "Most capable — best reasoning for complex, high-stakes analysis",
        },
        {
            "id": "anthropic:claude-sonnet-5",
            "label": "Sonnet 5",
            "description": "Balanced — fast and capable for most reasoning steps",
        },
        {
            "id": "anthropic:claude-haiku-4-5-20251001",
            "label": "Haiku 4.5",
            "description": "Fast and economical — quick lookups and simple steps",
        },
    ],
    "openai": [
        {
            "id": "openai:gpt-5.6-sol",
            "label": "GPT-5.6 Sol",
            "description": "Flagship — complex reasoning and coding",
        },
        {
            "id": "openai:gpt-5.6-terra",
            "label": "GPT-5.6 Terra",
            "description": "Balanced performance at lower cost",
        },
        {
            "id": "openai:gpt-5.6-luna",
            "label": "GPT-5.6 Luna",
            "description": "Fast and affordable for high-volume tasks",
        },
    ],
    "google": [
        {
            "id": "google:gemini-3.1-pro",
            "label": "Gemini 3.1 Pro",
            "description": "Flagship reasoning model (preview)",
        },
        {
            "id": "google:gemini-3.6-flash",
            "label": "Gemini 3.6 Flash",
            "description": "Latest — improved token efficiency and agentic planning",
        },
        {
            "id": "google:gemini-3.5-flash",
            "label": "Gemini 3.5 Flash",
            "description": "Frontier performance on agentic and coding tasks",
        },
        {
            "id": "google:gemini-3.5-flash-lite",
            "label": "Gemini 3.5 Flash-Lite",
            "description": "Low-latency, cost-effective for high-volume automation",
        },
    ],
}

RECOMMENDED_OLLAMA_MODELS: list[dict] = [
    {"tag": "gemma4:e4b", "label": "Gemma 4 E4B", "description": "Google's open model, default size — strong general reasoning, ~10GB"},
    {"tag": "gemma4:e2b", "label": "Gemma 4 E2B", "description": "Lightweight Gemma 4 — runs on modest hardware"},
    {"tag": "gemma4:26b", "label": "Gemma 4 26B", "description": "Larger Gemma 4 MoE — competitive with much bigger models"},
    {"tag": "llama3.3:70b", "label": "Llama 3.3 70B", "description": "Meta's open model — high quality, needs a capable GPU"},
    {"tag": "mistral", "label": "Mistral", "description": "Fast, efficient general-purpose open model"},
    {"tag": "phi4", "label": "Phi-4", "description": "Microsoft's small model — strong reasoning for its size"},
    {"tag": "qwen2.5", "label": "Qwen 2.5", "description": "Alibaba's open model — strong multilingual + coding support"},
]
