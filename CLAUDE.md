# CLAUDE.md — Sentinel Platform

> This file is the single source of truth for how we build on this repo. Claude Code (and humans) should read it before any task. If a request conflicts with this document, surface the conflict rather than silently deviating. Keep it current: when an architectural decision changes, update this file **and** add an ADR under `docs/adr/`.

---

## 1. What we are building

**Sentinel** is a configurable, multi-reasoning voice agent platform. A user speaks; the platform transcribes (STT), runs a **multi-step LangGraph reasoning workflow** over the request with persistent context, and reads the answer back (TTS). The defining feature is that the *reasoning workflow itself* — its steps and its "subject-matter expertise" (SME) — is **user-configurable**, selectable from defaults (e.g. "FTSE 100 Analyst", "Mental Health Support", "Recruitment Agent") and editable/extensible from a single configuration page.

Each SME is modelled as a loose **bounded context** (DDD). The domain definition for an SME is the source of truth from which we generate TypeScript types and TanStack Query hooks — domain drives code, never the reverse.

The primary UI is deliberately minimal: a **Three.js sound-wave visualisation** that animates in time with the LLM's spoken response amplitude, plus a microphone button. A chat transcript is available as a **slide-out drawer**. The waveform visual is designed to be swapped later for a 3D AI head; isolate it behind a stable component boundary so that swap is non-breaking.

### Non-negotiable product principles
- **Configuration over code for SMEs.** A new SME or a new reasoning step should be creatable by a user through the UI and persisted in Postgres — not by shipping new application code, wherever feasible.
- **Reasoning is transparent.** Every reasoning step is surfaced to the user as a discrete, inspectable event (which step ran, inputs, outputs, token cost).
- **Cloud-agnostic core, Azure-native deployment.** Application code must not import cloud-vendor SDKs directly; depend on local ports/interfaces with adapters. IaC targets Azure via Bicep today.
- **Observability and token accounting are first-class**, not an afterthought.

---

## 2. Repository layout (monorepo)

```
sentinel/
  CLAUDE.md                 # this file
  REVIEW.md                 # the review rubric Claude/humans apply to PRs
  docs/
    adr/                    # Architecture Decision Records (numbered)
    standards/              # detailed standards docs (linked from here)
  packages/
    domain/                 # SME / bounded-context definitions (source of truth)
    contracts/              # generated + hand-authored shared types/schemas
  apps/
    api/                    # FastAPI backend + LangGraph workflows
    web/                    # React 19 + Vite + MUI v9 frontend
  infra/
    bicep/                  # pure IaC for Azure (cloud-agnostic design)
  .claude/
    commands/               # custom slash commands
```

Workspace tooling: **pnpm 11.7.0 workspaces** for JS, **uv** for Python. One lockfile per ecosystem committed at root. The `packageManager` field in root `package.json` pins the pnpm version. Build-script allow-lists go in `pnpm-workspace.yaml` under `onlyBuiltDependencies` (pnpm 11.7+ moved this out of `package.json`).

---

## 3. Domain & DDD standards

We practise **loose DDD** — pragmatic, not dogmatic. See `docs/standards/ddd.md` for the full guide. Core rules:

- **Bounded context = SME.** "FTSE100Analyst", "MentalHealthSupport", "RecruitmentAgent" are bounded contexts. They do not share entities; if two contexts need the same concept, each owns its own model and we translate at the boundary (anti-corruption layer).
- **Layering inside `apps/api`** (dependencies point inward only):
  - `domain/` — entities, value objects, aggregates, domain events. **Pure Python. No FastAPI, no SQLAlchemy, no LangChain, no cloud SDK imports here.**
  - `application/` — use cases, orchestration, ports (abstract interfaces). Depends on `domain` only.
  - `infrastructure/` — adapters implementing ports: Postgres repositories, LangGraph runtime, STT/TTS providers, vector store. Depends on `application` + `domain`.
  - `interface/` — FastAPI routers, request/response models, dependency wiring. Depends inward.
- **Ports & adapters.** Anything external (DB, LLM provider, STT/TTS, vector store, cloud blob) is reached through an abstract port defined in `application/ports/`. This is what makes the core cloud-agnostic. A violation (e.g. an Azure SDK import in `domain/` or `application/`) is a blocking review failure.
- **Domain is the codegen source.** SME domain definitions live in `packages/domain` as declarative schema (Pydantic + JSON Schema export). The frontend's TypeScript types and TanStack Query hooks are **generated** from the contracts emitted by the API's OpenAPI schema + domain JSON Schema. Do not hand-edit generated files; edit the domain and regenerate (`/regen-contracts`).

---

## 4. Reasoning engine (LangGraph) standards

- Use **LangGraph** (`StateGraph`) for the reasoning workflow, **not** the deprecated LangChain `AgentExecutor`. LangChain is permitted only for retriever/tool/prompt building blocks that become node bodies.
- **State is explicit and typed**: define a `TypedDict` (or Pydantic) state schema per SME workflow. Every node takes state and returns a partial state update.
- **Persistence**: use `AsyncPostgresSaver` (`langgraph-checkpoint-postgres`) as the checkpointer, pointed at the same Postgres instance via `DATABASE_URL`. This gives durable cross-turn context, resume-on-failure, and time-travel debugging. Thread id = conversation id.
- **Steps are data.** An SME's reasoning steps are persisted configuration (Postgres), compiled into a graph at runtime. Adding a step is a config write + graph recompile, not a code change, for the supported step types (retrieve, reason, tool-call, summarise, guardrail-check).
- **Every node emits a `ReasoningStepEvent`** to the event stream (step name, started/finished, token usage, latency) so the frontend can surface steps live. Stream at the **graph level** (per-node), not just chain level.
- **Not every node needs a checkpointer.** Only the top-level conversation graph persists; sub-graphs/tool calls stay ephemeral unless they need resumability. Keeps the checkpoint table sustainable.
- Model access goes through the `LLMPort` adapter; never call a provider SDK directly from a node.

---

## 5. RAG architecture standards

User-configurable retrieval is core. See `docs/standards/rag.md`.

- A **`RetrievalSource`** is user-configured per SME and persisted: it points at either an **HTTP/JSON API** or an uploaded/seeded **JSON document set**. Provide the API-integration source as the canonical example template (`apps/api/.../infrastructure/rag/sources/example_http_source.py`).
- Pipeline: ingest → chunk → embed → store (pgvector in Postgres; same instance, separate schema) → hybrid retrieve (vector + keyword) → rerank → context-assemble. Keep each stage behind a port so individual stages are swappable.
- **No silent truncation.** If retrieved context exceeds the budget, the assembler logs what was dropped and records it as a reasoning-step output.
- Every retrieval records source provenance (which source, which chunk, score) and attaches it to the answer so the frontend can show citations.
- Embeddings provider is a port (`EmbeddingPort`); default adapter configurable, no vendor lock-in.

---

## 6. Frontend standards (apps/web)

- **React 19 + Vite + TypeScript (strict).**
- **MUI v9** (note: the ecosystem skipped v8; v9 aligns Material UI with MUI X and introduces Base UI-backed primitives). Use the theme/CSS-variables system; prefer `sx` sparingly and lift repeated styles into the theme.
- **Server state: TanStack Query v5** (`@tanstack/react-query`). All API access goes through **generated hooks** — do not write bespoke `fetch` calls in components.
- **Client/local UI state: Zustand** (lightweight). Use it for ephemeral UI concerns: drawer open/closed, mic recording state, selected SME draft before save, waveform settings. Do **not** mirror server state into Zustand — that's TanStack Query's job.
- **The Three.js waveform** lives in a single isolated component (`features/waveform/`) exposing a stable prop contract (`amplitude$` stream + config). It must be replaceable by the future 3D head without touching callers. No Three.js imports leak outside this feature folder.
- **Config page is one page.** SME selection, template editing, step editing, and RAG source config all live on a single route with tabbed/sectioned layout. Selecting a default template clones it into an editable draft; saving persists via a generated mutation hook.
- Accessibility is required: mic button and drawer must be keyboard-operable and screen-reader labelled. Lean on MUI v9's improved a11y defaults; don't regress them.

---

## 7. Backend standards (apps/api)

- **FastAPI**, async throughout. Pydantic v2 models at the interface layer only.
- **One responsibility for FastAPI**: HTTP interface + dependency wiring. Business logic lives in `application/`.
- OpenAPI schema is generated and **committed** (`packages/contracts/openapi.json`) so frontend codegen is reproducible in CI.
- Streaming responses (reasoning step events, TTS audio chunks) use Server-Sent Events or WebSocket; pick per endpoint and document in the router docstring.
- Migrations via **Alembic**; never hand-edit the DB. pgvector and the LangGraph checkpoint tables are managed via migrations.

---

## 8. Azure & IaC standards

Full detail in `docs/standards/azure.md`. Highlights:

- **Pure IaC, Bicep, no portal clicks.** Every Azure resource is declared in `infra/bicep`. If it isn't in Bicep, it doesn't exist.
- **Design cloud-agnostic.** Bicep is the deployment target, but application config is injected via environment variables / standard interfaces so the same image runs on any cloud or locally via docker-compose.
- **Services to use:** Azure Container Apps (API + web), Azure Database for PostgreSQL Flexible Server (with `pgvector`), Azure Key Vault (all secrets), Azure Container Registry, Azure Application Insights + Log Analytics (observability), Azure Storage (blob, for audio/uploads), Managed Identity for service-to-service auth.
- **Services to avoid unless justified by ADR:** anything that hard-couples the app to Azure-only APIs in the application layer (e.g. calling Azure OpenAI via Azure-specific SDK from a node — wrap it in `LLMPort` instead).
- **Naming convention:** `{org}-{system}-{env}-{resourceTypeAbbrev}-{instance}`, lower-kebab, e.g. `sentinel-prod-ca-api-01`. Abbreviations table in `docs/standards/azure.md`.
- **Tagging policy (mandatory on every resource):** `system=sentinel`, `env`, `owner`, `costCenter`, `managedBy=bicep`, `dataClassification`.
- **Region strategy:** primary `uksouth`, failover `ukwest`; region is a parameter, never hardcoded.
- **Secrets:** never in code, env files committed, or logs. All secrets resolve from Key Vault via Managed Identity at runtime. Generated code must follow this — a literal secret in a PR is a blocking failure.

---

## 9. Security standards

See `docs/standards/security.md`. Threat-model summary and OWASP Top-10 mitigations live there. Enforced rules:

- **AuthN/Z:** OIDC (Entra ID) for users; Managed Identity for services. No long-lived API keys in app code.
- **Secrets:** Key Vault only (see §8).
- **PII & logs:** transcripts and any user audio are PII. **Never log PII at INFO or above.** Redact before logging; structured logging fields must be allow-listed. Audio blobs encrypted at rest, lifecycle-expired.
- **Prompt-injection / RAG poisoning:** treat retrieved content and tool output as untrusted; never let it escalate tool permissions or override system instructions. Guardrail node validates before action.
- **OWASP Top 10:** validate/parameterise all inputs (no string-built SQL — use SQLAlchemy core/ORM), output-encode in the frontend, set security headers, rate-limit public endpoints, dependency scanning in CI.

---

## 10. Observability standards

See `docs/standards/observability.md`. Required in all generated code:

- **Structured logging** (JSON) to Application Insights via OpenTelemetry. Standard fields: `timestamp, level, service, env, traceId, spanId, conversationId, smeId, event`. No free-form `print`/`console.log` in committed code.
- **Distributed tracing** across web → api → LLM/RAG, one trace per user turn.
- **Token usage is a first-class metric.** Every LLM call records `prompt_tokens`, `completion_tokens`, `total_tokens`, `model`, `smeId`, `stepName`, and estimated cost. Emit as both a structured log event and a metric. The reasoning-step event stream surfaces per-step token cost to the UI, and an aggregate per-conversation total is persisted.
- **RED metrics** (Rate, Errors, Duration) on every API endpoint and every reasoning node.

---

## 11. Testing standards

See `docs/standards/testing.md`. Thresholds (CI-enforced):

- **Domain + application layers: ≥ 90% line coverage.** This is the high-value core; it is pure and fast to test.
- **Infrastructure/interface: ≥ 70%.**
- **Frontend: ≥ 80%** on hooks and non-trivial components (Vitest + Testing Library).
- **What must always be tested:** every domain invariant/aggregate rule; every use case happy + key failure paths; every reasoning node in isolation with a stubbed `LLMPort`; every port has a contract test its adapters must pass; RAG retrieval ranking with fixtures; auth/authorisation on every protected route; PII-redaction in logging.
- **E2E:** at least one Playwright flow: select SME → speak (mocked STT) → reasoning steps stream → spoken answer (mocked TTS) → transcript appears in drawer.
- Tests are deterministic: no live LLM/STT/TTS/network calls in unit/integration tests — use the ports with fakes.

---

## 12. Definition of Done

A task is **not done** until all of the following are true. Claude must verify each before declaring completion:

1. Code compiles / type-checks (`tsc --noEmit`, `mypy`/`pyright`) with zero errors.
2. Lint + format pass (`ruff`, `eslint`, `prettier`) with zero new violations.
3. Tests added/updated; coverage thresholds (§11) met; full suite green.
4. No DDD layer-boundary violation (run `/check-boundaries`).
5. No secret literals; all config via env/Key Vault.
6. No PII logged above DEBUG; redaction in place where relevant.
7. Token usage + tracing instrumented for any new LLM/RAG path.
8. Contracts regenerated if the domain/OpenAPI changed (`/regen-contracts`), and committed.
9. IaC updated if infrastructure changed; `bicep build` succeeds.
10. Docs touched: relevant standards doc and/or a new ADR if an architectural decision was made.
11. `REVIEW.md` rubric self-applied; PR description follows §13.

If any item cannot be satisfied, **stop and report why** rather than marking done.

---

## 13. PR standards

A good PR:
- Is **small and single-purpose** (one bounded concern). Split otherwise.
- Title: `type(scope): summary` (Conventional Commits) — `feat(api)`, `fix(web)`, `chore(infra)`, `refactor(domain)`, etc.
- Body contains: **What & why**, **How** (key decisions), **Testing** (what was added + how to verify), **Risk/rollback**, **Screenshots** for UI, **ADR link** if applicable, and a filled **Definition-of-Done checklist** (§12).
- Touches no generated files by hand.
- Passes CI (lint, types, tests, coverage, boundary check, `bicep build`, dependency scan).

---

## 14. How Claude should work in this repo

- **Read before writing.** Read this file, the relevant `docs/standards/*`, and existing neighbouring code. Match local conventions.
- **Plan first for non-trivial tasks.** State the plan, the files you'll touch, and the boundaries you'll respect, then implement.
- **Prefer config-driven extension** (new SME/step as data) over new code paths.
- **Never weaken a standard to make a test pass.** Fix the code, or raise the conflict.
- **Use the slash commands** in `.claude/commands/` for repeat patterns: `/new-sme`, `/new-service`, `/adr`, `/review`, `/regen-contracts`, `/check-boundaries`.
- When answering review mentions (e.g. *"@claude does this match the DDD layer boundaries?"*, *"is there any PII leaking into the log statements?"*, *"write missing tests for the domain layer changes"*), apply the specific standard section above and cite the rule you're enforcing.
- If you're unsure whether something is current (a library version, an Azure service capability), **verify** rather than assuming; this repo pins versions in `docs/standards/stack-versions.md`.
