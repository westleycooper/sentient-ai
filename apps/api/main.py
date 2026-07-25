"""Sentient API — FastAPI entrypoint. One responsibility: wiring and startup."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local from repo root when present (local dev). Never overrides real env vars.
load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from infrastructure.observability.logging import configure_logging
from infrastructure.observability.tracing import configure_tracing
from interface.routers import agent as agent_router
from interface.routers import agent_config, conversations, mcp_explorer, mcp_status, sme, stt, tts

configure_logging()
configure_tracing()

# Validate STT/TTS keys at startup so missing config fails loudly, not silently on first request.
_STT_REQUIRED_KEYS = {"deepgram": ["DEEPGRAM_API_KEY"], "openai": ["OPENAI_API_KEY"], "azure": ["AZURE_SPEECH_KEY"]}
_TTS_REQUIRED_KEYS = {"deepgram": ["DEEPGRAM_API_KEY"], "elevenlabs": ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"], "openai": ["OPENAI_API_KEY"], "azure": ["AZURE_SPEECH_KEY"]}

for _provider, _keys in [
    (os.getenv("STT_PROVIDER", "stub"), _STT_REQUIRED_KEYS),
    (os.getenv("TTS_PROVIDER", "stub"), _TTS_REQUIRED_KEYS),
]:
    for _key in _keys.get(_provider, []):
        if not os.getenv(_key):
            raise RuntimeError(f"Missing required env var for {_provider}: {_key}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    from interface.dependencies import set_checkpointer

    async with AsyncPostgresSaver.from_conn_string(os.environ["DATABASE_URL"]) as cp:
        await cp.setup()
        set_checkpointer(cp)
        # _sentient_mcp is assigned at module scope below, before this ever runs
        # (lifespan only executes once the whole module has finished importing).
        # Its session_manager is only valid after streamable_http_app() has been
        # called, which the mount below does at import time — never call it here.
        if _sentient_mcp is not None:
            async with _sentient_mcp.session_manager.run():
                yield
        else:
            yield


app = FastAPI(
    title="Sentient API",
    version="0.1.0",
    description="Multi-reasoning voice agent platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FastAPIInstrumentor.instrument_app(app)

app.include_router(sme.router)
app.include_router(conversations.router)
app.include_router(tts.router)
app.include_router(stt.router)
app.include_router(agent_config.router)
app.include_router(mcp_status.router)  # always on — no PII, safe in prod

# Coding agent — local-only feature (ADR-0003). Never mounted in production.
if os.getenv("ENV", "local") != "production":
    app.include_router(agent_router.router)

# MCP server — local-only feature (ADR-0004). Never mounted in production:
# exposes conversation transcripts (PII, CLAUDE.md §9) with no auth in v1.
# Mounted here (module scope, import time) rather than in lifespan, since
# streamable_http_app() must be called before .session_manager becomes valid.
_sentient_mcp = None
if os.getenv("ENV", "local") != "production":
    from interface.mcp.server import mcp as _sentient_mcp
    app.mount("/mcp", _sentient_mcp.streamable_http_app())
    # Interactive explorer (ADR-0004 addendum) — executes real actions
    # (including the LangGraph reasoning graph), so it shares this gate
    # rather than mcp_status.router's always-on one.
    app.include_router(mcp_explorer.router)


@app.get("/health", tags=["ops"], include_in_schema=False)
async def health():
    return {"status": "ok"}
