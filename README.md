# Sentient AI

Configurable, multi-reasoning voice agent platform. Speak -> STT -> multi-step
LangGraph reasoning with persistent Postgres context -> TTS. Reasoning steps and
subject-matter expertise (SME) are user-configurable from one page; domain drives
generated frontend types + hooks. Minimal UI: Three.js waveform + mic button, with
a slide-out chat transcript.

> 🌐 <a href="https://westleycooper.github.io/sentient-ai/showcase/" target="_blank" rel="noopener noreferrer"><strong>View the showcase site ↗</strong></a> —
> features, live Three.js demos, themes, and licensing, served straight from this
> repo via GitHub Pages. (One-time setup: repo **Settings → Pages → Deploy from a
> branch**, pick the branch and the **`/docs`** folder, save. Regenerate the static
> bundle after showcase changes with `pnpm --filter sentient-web build:showcase`.)

---

## Quick start (already set up)

```bash
# Postgres
docker compose up postgres -d

# Terminal 1 — API
cd apps/api && uv run uvicorn main:app --reload

# Terminal 2 — Frontend
cd apps/web && pnpm dev
```

Then open **http://localhost:5173**.

Port already taken by another Vite app? Override it: `pnpm dev --port 5174` (the
`/api` and `/ws` dev proxies to the backend are unaffected — only the frontend's
own port changes, so update the URL above accordingly).

---

## Getting started

See **[SETUP.md](SETUP.md)** for full installation instructions covering macOS, Linux, and Windows — with or without Docker, and with or without WSL 2.

---

## Repository layout

```
sentient/
  apps/
    api/          FastAPI + LangGraph — domain / application / infrastructure / interface
    web/          React 19 + Vite + MUI v9 + TanStack Query + Zustand + Three.js
  packages/
    domain/       SME bounded-context definitions — source of truth for codegen
    contracts/    Committed openapi.json + generated TS types + hooks
  infra/
    bicep/        Pure IaC for Azure (Bicep)
    terraform/    Pure IaC for Azure (Terraform)
  docs/
    adr/          Architecture Decision Records
    standards/    DDD, RAG, Azure, security, observability, testing, stack versions
```

## Key docs

- `CLAUDE.md` — standards, architecture rules, Definition of Done. Read before any task.
- `SETUP.md` — developer setup for macOS, Linux, and Windows.
- `REVIEW.md` — PR review rubric.
- `docs/standards/` — DDD, RAG, Azure, security, observability, testing, stack versions.
- `docs/adr/` — architecture decisions.

## Model selection

Every SME has a default model, and can opt in to a different model per
reasoning step. The config page's model browser covers **frontier providers**
(Anthropic, OpenAI, Google — configure `OPENAI_API_KEY`/`GOOGLE_API_KEY` in
`.env.local` to unlock the extra two, Anthropic works out of the box) and
**local models via [Ollama](https://ollama.com/download)** — install it, run
`ollama serve`, and the Local tab lets you download and select models like
Gemma 4 with no API key. See [ADR-0005](docs/adr/0005-multi-provider-model-selection.md).

## Local-only developer features

Two features are mounted **only when `ENV != production`** (default in local dev)
and are never exposed in a cloud deployment. The frontend hides their nav entry
points the same way, driven by `GET /mcp-status`'s `mounted` flag.

- **Coding agent** (<a href="http://localhost:5173/agent" target="_blank" rel="noopener noreferrer"><code>/agent</code> ↗</a>) —
  a voice-driven coding assistant with direct read/write/execute access to
  this project's source tree, WebSocket-based with a tool-approval gate on
  every action. Speaking instead of typing also makes it an accessibility
  feature, not just a novelty. See [ADR-0003](docs/adr/0003-coding-agent-websocket-tool-approval.md).
- **MCP server** (<a href="http://localhost:5173/mcp" target="_blank" rel="noopener noreferrer"><code>/mcp</code> ↗</a>) —
  exposes Sentient AI's SME templates and conversation state to external MCP
  clients (e.g. Claude Desktop) over Streamable HTTP at `/mcp`; the linked
  frontend page visualises what's exposed. No auth on the MCP transport in
  v1, which is why it's local-only for now. See [ADR-0004](docs/adr/0004-mcp-server.md).

Links above point at the local dev server (`pnpm dev`, see Quick start) and
open in a new tab — they won't resolve unless that server is running.

## Custom Claude Code commands

`/new-sme`, `/new-service`, `/adr`, `/review`, `/regen-contracts`, `/check-boundaries`, `/pii-check`.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Free for personal, educational, and
research use; commercial use is welcome and encouraged.
