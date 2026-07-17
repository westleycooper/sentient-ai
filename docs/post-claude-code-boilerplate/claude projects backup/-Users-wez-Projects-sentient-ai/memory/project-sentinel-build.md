---
name: project-sentinel-build
description: "Current build status of the Sentinel platform — what layers exist, what's stubbed, what's next"
metadata: 
  node_type: memory
  type: project
  originSessionId: 788a1f66-5f76-4442-8598-8fca7e64c9ea
---

# Sentinel Platform Build Status (as of 2026-06-17)

All foundation layers are built and tested. 29 Python tests pass, 100% coverage on domain + application.

## What's built

### Backend (apps/api)
- **domain/conversation.py** — Conversation aggregate, Message entity, TurnCompletedEvent, DomainError invariants
- **application/ports/** — LLMPort, RetrievalSourcePort, SttPort, TtsPort, EmbeddingPort, ConversationRepositoryPort, SmeRepositoryPort, BlobStorePort
- **application/use_cases/** — GetSmeTemplates, SaveSmeTemplate, DeleteSmeTemplate, StartConversation, ProcessTurn
- **infrastructure/llm/anthropic_adapter.py** — LLMPort via langchain-anthropic
- **infrastructure/persistence/** — SQLAlchemy models, PostgresConversationRepository, PostgresSmeRepository
- **infrastructure/reasoning/graph.py** — LangGraph StateGraph skeleton (retrieve→reason→summarise)
- **infrastructure/reasoning/graph_runner.py** — GraphRunnerPort adapter, streams partial state
- **infrastructure/stt/stub_stt_adapter.py**, **infrastructure/tts/stub_tts_adapter.py** — stubs (replace with Azure Speech for prod)
- **infrastructure/observability/** — structured JSON logging, OpenTelemetry tracing
- **interface/** — FastAPI main.py, sme router (CRUD), conversations router (start + GET + SSE /turn), DTOs, dependency wiring
- **alembic/** — initial migration: conversations, messages, sme_templates + pgvector extension
- **packages/domain/src/sentinel_domain/sme.py** — canonical SME domain: SmeTemplate, ftse100_default, mental_health_default, recruitment_default

### Frontend (apps/web)
- MUI v9 dark theme, React Router v6, TanStack Query v5, Zustand v5
- **HomePage** — Three.js waveform + animated mic button + SSE turn streaming + ReasoningSteps overlay + SME selector + drawer toggle
- **ConfigPage** — left template cards, right SmeEditor with tabbed Soul/Steps/Rules editors
- **TranscriptDrawer** — slide-out, aria-live, per-message bubbles with token counts
- **API client + hooks** — streamEvents() for SSE, TanStack Query hooks for SME CRUD + conversation management

### Contracts (packages/contracts)
- openapi.json committed — all routes documented

## What's stubbed / needs wiring for production
- **STT**: StubSttAdapter returns placeholder text; replace with AzureSpeechSttAdapter
- **TTS**: StubTtsAdapter returns silent WAV; replace with AzureSpeechTtsAdapter or ElevenLabs
- **Audio endpoint**: `/conversations/{id}/audio-turn` returns 501 — wire SttPort to enable
- **RAG**: StubRetriever in dependencies.py; replace with pgvector-backed RetrievalSourcePort
- **pnpm install**: frontend deps not yet installed (npm packages specified, uv sync done for Python)

## Open ADR decisions (flagged in original boilerplate)
- STT/TTS provider choice
- SSE vs WebSocket for audio streaming
- Codegen tool (@hey-api/openapi-ts vs orval) for generating TS types from openapi.json

**Why:** The user wants to build the platform with Claude Code incrementally, starting from this foundation.
**How to apply:** When continuing work, read this memory to understand what exists before planning new features.
