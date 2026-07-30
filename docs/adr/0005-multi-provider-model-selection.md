# ADR-0005: Multi-provider + local-model selection for SME reasoning

- Status: Accepted
- Date: 2026-07-30
- Deciders: Platform

## Context

Every reasoning step in every SME conversation used exactly one hardcoded
model, chosen at process boot: `AnthropicLlmAdapter` was instantiated once as
a process-wide singleton, and `graph.py`/`guardrail_executor.py` each
independently read `_FAST_MODEL = os.environ.get("REASONING_MODEL", ...)` and
passed it explicitly into every LLM call. There was no way to choose a model
per SME, no way to override a model per reasoning step, and no way to use
anything other than Anthropic or a locally-run model.

Users want: a model "browser" to pick from the latest frontier models across
multiple providers on a per-SME basis; the ability to download and run local
models (e.g. Gemma 3 via Ollama) and select them the same way; and an opt-in
per-reasoning-step override — most steps share one default model, but a step
that, say, needs a specific model after retrieval can use a different one.

## Decision

**Namespaced model-id scheme.** Model identity is a single string everywhere:
`"<provider>:<model-id>"`, e.g. `anthropic:claude-sonnet-5`,
`openai:gpt-5.6-terra`, `google:gemini-3-pro`, `ollama:gemma3:12b`. Parsing
(`sentient_domain.model_ref.parse_model_ref`) splits on the **first** colon
only, since Ollama's own tags already contain a colon (`gemma3:12b`); a bare
id with no provider prefix is treated as Anthropic, so existing unqualified
env-var defaults keep working unchanged.

**`LlmRouter` composite adapter.** `LLMPort` already accepted an optional
per-call `model: str | None` on both `complete()` and `complete_with_tools()`
— that seam meant the port itself, and every existing caller
(`GraphRunner`, `build_graph()`, `guardrail_executor.run_guardrail()`), could
stay completely unchanged. `infrastructure/llm/llm_router.py::LlmRouter`
itself implements `LLMPort` and dispatches to the correct underlying provider
adapter by parsing the model string's namespace: `model=None` uses the
default provider (today's exact zero-config behaviour), a namespaced model
looks up the matching adapter and calls it with the **unqualified** id
(prefix stripped). Only the DI wiring in `interface/dependencies.py` changed —
`_llm_adapter()` (a bare `AnthropicLlmAdapter`) became `_llm_router()`
(an `LlmRouter` composing every configured provider adapter).

**Fail-fast vs. graceful-degrade, deliberately asymmetric.** A step
referencing `openai:...` with no `OPENAI_API_KEY` configured raises
`ProviderNotConfiguredError` immediately — this is a configuration mistake,
not a transient condition, and should surface loudly. Ollama being
unreachable is handled differently: `LocalModelRuntimePort.health()` and
`list_installed()` never raise, they return `False`/`[]`, so the model
*browser* UI can show an instructional "Ollama isn't running" state instead
of an error. The distinction: cloud misconfiguration is caught at
step-authoring time (the model was already validated as reachable when
picked in the browser); local-runtime availability is expected to fluctuate
and must degrade gracefully wherever it's checked.

**Curated static catalogs for frontier providers; live catalog for Ollama.**
`domain/model_catalog.py::FRONTIER_MODELS` is a small hand-maintained
`{id, label, description}` list per provider (Anthropic, OpenAI, Google),
mirroring the existing `agent_config.py::AVAILABLE_MODELS` pattern used by
the (unrelated) coding-agent feature — no live "list models" API calls, no
extra latency/failure surface, easy to keep descriptions consistent. This is
the opposite choice from local models, which are **always** queried live from
Ollama's own `/api/tags` (that's the entire point of a local install) plus a
small curated "recommended to download" shortlist
(`RECOMMENDED_OLLAMA_MODELS`) for UX convenience — distinct from Ollama's own
full model library, which is not scraped.

**Ollama reached over plain HTTP — no new SDK dependency.** Both
`infrastructure/llm/ollama_adapter.py` (chat completion, implements
`LLMPort`) and `ollama_runtime_adapter.py` (browse/pull/delete, implements the
new `LocalModelRuntimePort`) use `httpx` directly, already a pinned
dependency. Ollama's `/api/chat` response has no OpenAI-style `usage` object
— token counts come back as top-level `prompt_eval_count`/`eval_count`,
mapped explicitly into `TokenUsage`.

**Per-SME and per-step model configuration.** `SmeTemplate` gains
`default_model: str | None` and `use_step_models: bool`; `ReasoningStep`
gains `model: str | None`. A single pure method,
`SmeTemplate.resolve_model(step)`, is the one place the
step → template-default precedence rule is expressed: it returns
`step.model` only when `use_step_models` is on and the step has one set,
otherwise `default_model`. It returns `None` when nothing is configured —
the infrastructure call site (`graph.py`) is responsible for the final
`or _FAST_MODEL` env-var fallback, keeping domain free of env reads
(CLAUDE.md §3). `ReasoningStep.model` needed no migration since `steps` is
already a JSON column; `SmeTemplate`'s two new fields got a small Alembic
migration (`0008_add_model_fields.py`) following the exact precedent of the
`visualisation_kind`/`theme_id` migrations.

## Layer allocation

| Concern | Layer | Module |
|---------|-------|--------|
| `parse_model_ref`, `SmeTemplate.default_model`/`use_step_models`, `ReasoningStep.model`, `resolve_model()` | `packages/domain` | `sentient_domain/model_ref.py`, `sentient_domain/sme.py` |
| `LocalModelRuntimePort` (health/list/pull/delete) | `application/ports/` | `application/ports/local_model_runtime_port.py` |
| `GetLocalModelBrowserStateUseCase`, `PullLocalModelUseCase`, `DeleteLocalModelUseCase` | `application/use_cases/` | same directory |
| `LlmRouter`, provider adapters (`openai_adapter.py`, `google_adapter.py`, `ollama_adapter.py`, `ollama_runtime_adapter.py`) | `infrastructure/llm/` | same directory |
| `FRONTIER_MODELS`, `RECOMMENDED_OLLAMA_MODELS` (static data, no I/O) | `apps/api/domain/` | `domain/model_catalog.py` |
| `/models/frontier`, `/models/local`, `/models/local/pull`, `/models/local/{tag}` | `interface/` | `interface/routers/models.py` |
| `ModelBrowser` dialog, per-SME/per-step model chips | `apps/web` | `features/config/ModelBrowser.tsx`, `SmeEditor.tsx`, `StepEditor.tsx` |

## Consequences

+ Multi-provider and local-model flexibility with **zero signature changes**
  to `LLMPort`, `GraphRunner`, `build_graph()`, or `guardrail_executor`'s
  public functions — the entire feature is additive.
+ Curated frontier lists keep the UX deliberate and avoid per-provider
  catalog-API cost, latency, and inconsistent metadata.
+ Ollama needs no new SDK — same `httpx` dependency already in use elsewhere.
+ Fixed a pre-existing gap along the way: `AnthropicLlmAdapter` rebuilt a
  fresh `ChatAnthropic` client on every call with a non-default model; it
  (and the new OpenAI/Google adapters) now cache one client per model string.
- `google-genai` is a genuinely new dependency (Anthropic and OpenAI SDKs
  were already present for other features, so those two providers added
  none).
- Fail-fast on a misconfigured provider means the failure surfaces
  mid-conversation rather than at SME-save time — not solved by save-time
  validation, since Ollama tags are free-text and env vars can change after
  save. Accepted as a deliberate tradeoff (see Decision).
- Frontier catalogs are hand-maintained data that will drift as providers
  ship new models; update `domain/model_catalog.py` by hand as needed.

## Alternatives considered

**Live per-provider catalog queries** — rejected for frontier providers:
adds latency, a new failure mode per provider (API down/key invalid), and
providers return raw model ids without curated descriptions, needing extra
filtering logic to hide deprecated/irrelevant models. Local models take the
opposite approach precisely because a live catalog *is* the point there —
the whole feature is "what's actually installed and downloadable right now."

**A single "universal" LangChain `init_chat_model`-style abstraction** —
rejected as too magic, and it doesn't cleanly handle Ollama's non-standard
`prompt_eval_count`/`eval_count` usage fields without custom mapping anyway,
so the `LlmRouter` + explicit per-provider adapters approach was no more
work and stayed consistent with this repo's existing hand-rolled
`AnthropicLlmAdapter`.

**Merging the frontier catalog and Ollama runtime into one port** — rejected:
static data with zero I/O (frontier catalogs) doesn't need port-and-adapter
ceremony, whereas Ollama's runtime state (installed models, long-running
pulls) is genuine I/O against a daemon that may not be running. Forcing them
into one abstraction would have added complexity without benefit.
