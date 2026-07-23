# Sentinel

Configurable, multi-reasoning voice agent platform. Speak -> STT -> multi-step
LangGraph reasoning with persistent Postgres context -> TTS. Reasoning steps and
subject-matter expertise (SME) are user-configurable from one page; domain drives
generated frontend types + hooks. Minimal UI: Three.js waveform + mic button, with
a slide-out chat transcript.

- **DDD-modelled personas.** Each SME (FTSE 100 Analyst, Mental Health Support,
  Recruitment Agent, ...) is a bounded context with its own reasoning steps,
  rules, and RAG sources — no shared entities, translated at the boundary.
  `packages/domain` is the source of truth: it drives the generated OpenAPI
  contract and the frontend's TypeScript types + TanStack Query hooks.
- **Self-hosted MCP server.** Sentinel also exposes its SME templates and live
  conversation state as an MCP (Model Context Protocol) server, so external
  clients like Claude Desktop can query into the platform directly, not just
  through its own UI. See the in-product `/mcp` explorer and
  `docs/adr/0004-mcp-server.md`.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/sme-ui-ftse.png" alt="FTSE 100 Analyst SME — voice UI" /></td>
    <td width="50%"><img src="docs/screenshots/mcp-server.png" alt="MCP server explorer" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/sme-config-steps.png" alt="SME config — reasoning steps" /></td>
    <td width="50%"><img src="docs/screenshots/sme-config-rules.png" alt="SME config — rules" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/sme-config-rag.png" alt="SME config — RAG sources" /></td>
    <td width="50%"><img src="docs/screenshots/sme-ui-blocks.png" alt="English Blocks Tutor SME — voice UI" /></td>
  </tr>
</table>

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

---

## Getting started

See **[SETUP.md](SETUP.md)** for full installation instructions covering macOS, Linux, and Windows — with or without Docker, and with or without WSL 2.

---

## Repository layout

```
sentinel/
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

## Local-only developer features

Two features are mounted **only when `ENV != production`** (default in local dev)
and are never exposed in a cloud deployment. The frontend hides their nav entry
points the same way, driven by `GET /mcp-status`'s `mounted` flag.

- **Coding agent** (<a href="http://localhost:5173/agent" target="_blank" rel="noopener noreferrer"><code>/agent</code> ↗</a>) —
  a voice-driven coding assistant with direct read/write/execute access to
  this project's source tree, WebSocket-based with a tool-approval gate on
  every action. See [ADR-0003](docs/adr/0003-coding-agent-websocket-tool-approval.md).
- **MCP server** (<a href="http://localhost:5173/mcp" target="_blank" rel="noopener noreferrer"><code>/mcp</code> ↗</a>) —
  exposes Sentinel's SME templates and conversation state to external MCP
  clients (e.g. Claude Desktop) over Streamable HTTP at `/mcp`; the linked
  frontend page visualises what's exposed. No auth on the MCP transport in
  v1, which is why it's local-only for now. See [ADR-0004](docs/adr/0004-mcp-server.md).

Links above point at the local dev server (`pnpm dev`, see Quick start) and
open in a new tab — they won't resolve unless that server is running.

## Custom Claude Code commands

`/new-sme`, `/new-service`, `/adr`, `/review`, `/regen-contracts`, `/check-boundaries`, `/pii-check`.
