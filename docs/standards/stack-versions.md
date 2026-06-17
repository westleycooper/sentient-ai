# Stack Versions (pinned)

Verified June 2026. Update with an ADR when bumping a major.

## Backend
- Python 3.12, managed with `uv`
- FastAPI (latest 0.11x), Pydantic v2
- LangGraph v1.x (`StateGraph`) — **AgentExecutor is deprecated (EOL Dec 2026), do not use**
- LangChain v1.2+ — only for retriever/tool/prompt building blocks
- `langgraph-checkpoint-postgres` (AsyncPostgresSaver)
- SQLAlchemy 2.x + Alembic
- pgvector (Postgres extension)
- OpenTelemetry SDK + azure-monitor-opentelemetry exporter

## Frontend
- React 19.x (keep >= 19.2.5 if ever using Server Functions; we don't)
- Vite 6.x
- TypeScript 5.x, strict mode
- MUI v9 (@mui/material@^9) — ecosystem skipped v8 to align Material UI with MUI X; v9 adds Base UI-backed primitives. MUI X v9 has a Chat package worth evaluating for the transcript drawer.
- @tanstack/react-query@^5
- Zustand 5.x for local/UI state
- three.js (latest) — confined to features/waveform
- Vitest + @testing-library/react + Playwright

## Tooling
- **pnpm 11.7.0** — workspace manager. `packageManager` field in root `package.json` pins this. `onlyBuiltDependencies` lives in `pnpm-workspace.yaml` (pnpm 11.7+ moved it from `package.json`).
- **Node 20+** (24.x in use)
- **uv 0.4+** — Python package manager

## Codegen
- openapi-typescript + @hey-api/openapi-ts (or orval) to generate types + TanStack Query hooks from committed openapi.json

## Notes
- LangChain create_agent runs on LangGraph internally since Oct 2025 — prototype with it, graduate to explicit StateGraph for production graphs.
- pnpm 11.7+ reads workspace settings from `pnpm-workspace.yaml`, not `package.json["pnpm"]`. If you hit `ERR_PNPM_IGNORED_BUILDS` add the package to `onlyBuiltDependencies` in `pnpm-workspace.yaml`.
