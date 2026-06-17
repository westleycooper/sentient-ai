# Sentinel

Configurable, multi-reasoning voice agent platform. Speak -> STT -> multi-step
LangGraph reasoning with persistent Postgres context -> TTS. Reasoning steps and
subject-matter expertise (SME) are user-configurable from one page; domain drives
generated frontend types + hooks. Minimal UI: Three.js waveform + mic button, with
a slide-out chat transcript.

---

## Developer setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://python.org) or `pyenv install 3.12` |
| uv | 0.4+ | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node | 20+ | [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org) |
| pnpm | 11+ | `npm install -g pnpm` or `corepack enable` |
| Docker | any | [docker.com](https://docker.com) — for local Postgres |

### 1. Clone and configure

```bash
git clone <repo-url> && cd sentient-ai
cp .env.local.example .env.local
```

Open `.env.local` and set:

```
ANTHROPIC_API_KEY=sk-ant-...    # required — get from console.anthropic.com
```

Everything else defaults to local values and can be left as-is for development.

### 2. Start Postgres

```bash
docker compose up postgres -d
```

This starts a `pgvector`-enabled Postgres on port 5432 with the credentials
already in `.env.local.example`.

### 3. Install and run the API

```bash
cd apps/api
uv sync                        # install Python dependencies
uv run alembic upgrade head    # create tables (run once, and after migrations)
uv run uvicorn main:app --reload
```

API is now running at **http://localhost:8000**. Interactive docs at
**http://localhost:8000/docs**.

### 4. Install and run the frontend

Open a second terminal from the repo root:

```bash
pnpm install      # install all workspace packages
cd apps/web
pnpm dev
```

Frontend is now at **http://localhost:5173**.

### 5. Try it

1. Open [http://localhost:5173](http://localhost:5173).
2. Select an SME from the dropdown (FTSE 100 Analyst, Mental Health Support, Recruitment Agent).
3. Click the mic button — type or paste text when prompted (STT is stubbed locally; see below).
4. Watch the reasoning steps appear live as LangGraph processes the turn.
5. Click the chat icon to open the transcript drawer.
6. Click the settings icon to edit SME templates, steps, and rules.

### What's stubbed in local dev

| Feature | Local behaviour | To enable for real |
|---------|---------------|--------------------|
| Speech-to-text | Returns placeholder text | Set `STT_PROVIDER=azure` + Azure Speech keys in `.env.local` |
| Text-to-speech | Returns silent audio | Set `TTS_PROVIDER=azure` or `TTS_PROVIDER=elevenlabs` + keys |
| RAG retrieval | Returns a stub chunk | Wire a `RetrievalSourcePort` adapter and configure a source via the config page |

### Running tests

```bash
# Backend — domain + application layers (≥90% coverage enforced)
cd apps/api
uv run pytest --cov

# Frontend
cd apps/web
pnpm test
```

### Useful commands

```bash
# Regenerate TypeScript types + hooks from the committed OpenAPI schema
/regen-contracts

# Check DDD layer boundaries haven't been violated
/check-boundaries

# Add a new SME template (scaffolds domain, use case, tests)
/new-sme

# Generate an Architecture Decision Record
/adr
```

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
    bicep/        Pure IaC for Azure (cloud-agnostic app config)
  docs/
    adr/          Architecture Decision Records
    standards/    DDD, RAG, Azure, security, observability, testing, stack versions
```

## Key docs

- `CLAUDE.md` — standards, architecture rules, Definition of Done. Read before any task.
- `REVIEW.md` — PR review rubric.
- `docs/standards/` — DDD, RAG, Azure, security, observability, testing, stack versions.
- `docs/adr/` — architecture decisions.

## Custom Claude Code commands

`/new-sme`, `/new-service`, `/adr`, `/review`, `/regen-contracts`, `/check-boundaries`, `/pii-check`.
