# REVIEW.md — Review rubric for Sentinel

This is the checklist a reviewer (human or Claude) applies to every PR. Claude should use this verbatim when asked to review, and reference the specific failing item. Items map to `CLAUDE.md`. Mark each ✅ / ❌ / N/A with a one-line reason.

## How to invoke
- `/review` runs the full rubric on the current diff.
- Inline mentions target one section, e.g.:
  - `@claude does this match the DDD layer boundaries?` → run **B**.
  - `@claude is there any PII leaking into the log statements here?` → run **E**.
  - `@claude write missing tests for the domain layer changes in this PR` → run **F**, then implement.

---

## A. Scope & hygiene
- [ ] Single-purpose, small diff. No unrelated changes.
- [ ] Conventional-commit title. PR body has What/Why/How/Testing/Risk.
- [ ] No hand-edited generated files (`packages/contracts/generated/**`, generated hooks/types).
- [ ] No commented-out code, no stray TODOs without an issue link.

## B. DDD & architecture boundaries (blocking)
- [ ] `domain/` imports nothing from FastAPI, SQLAlchemy, LangChain/LangGraph, or any cloud SDK.
- [ ] `application/` depends only on `domain` + its own `ports/`; no infrastructure imports.
- [ ] External systems reached only through ports; adapters live in `infrastructure/`.
- [ ] No cross-bounded-context entity sharing; translation at boundaries.
- [ ] Run `/check-boundaries` — passes.

## C. Reasoning engine
- [ ] Uses LangGraph `StateGraph`; no `AgentExecutor`.
- [ ] State schema typed; nodes return partial updates.
- [ ] Postgres checkpointer used for the conversation graph; thread id = conversation id.
- [ ] Each node emits a `ReasoningStepEvent` with token usage + latency.
- [ ] LLM access via `LLMPort` only.

## D. RAG
- [ ] Retrieval sources are config-driven and persisted; no hardcoded source.
- [ ] Provenance (source, chunk, score) recorded and attached to the answer.
- [ ] Pipeline stages behind ports; no silent context truncation.

## E. Security & PII (blocking)
- [ ] No secret literals; all secrets via env → Key Vault.
- [ ] No PII (transcripts, audio, user identifiers) logged at INFO+; redaction present.
- [ ] Inputs validated; SQL parameterised (no string-built queries).
- [ ] AuthZ enforced on every protected route; retrieved/tool content treated as untrusted.
- [ ] Frontend output-encodes; security headers set where applicable.

## F. Testing
- [ ] Domain/application coverage ≥ 90%; infra/interface ≥ 70%; web ≥ 80%.
- [ ] New domain invariants, use cases, reasoning nodes, ports all tested.
- [ ] No live network/LLM/STT/TTS in unit/integration tests (fakes via ports).
- [ ] E2E updated if the core voice→reasoning→speech flow changed.

## G. Observability
- [ ] Structured JSON logging with the standard field set; no `print`/`console.log`.
- [ ] Tracing spans across the new path; one trace per user turn.
- [ ] Token usage recorded (prompt/completion/total/model/sme/step + cost) and surfaced.
- [ ] RED metrics on new endpoints/nodes.

## H. Frontend specifics
- [ ] Server state via generated TanStack Query hooks; local/UI state via Zustand.
- [ ] Three.js confined to `features/waveform/`; stable prop contract preserved.
- [ ] Config remains a single page; default templates clone to editable drafts.
- [ ] Keyboard + screen-reader accessible (mic button, drawer).

## I. IaC
- [ ] Infra changes in Bicep only; `bicep build` succeeds.
- [ ] Naming + mandatory tags applied; region parameterised; secrets via Key Vault refs.

## J. Definition of Done
- [ ] All `CLAUDE.md` §12 items verified. If any fail, PR is **Request changes**.

**Verdict:** Approve / Request changes — with the specific blocking items listed.
