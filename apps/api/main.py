"""Sentinel API — FastAPI entrypoint. One responsibility: wiring and startup."""
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
from interface.routers import conversations, sme

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
        yield


app = FastAPI(
    title="Sentinel API",
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


@app.get("/health", tags=["ops"], include_in_schema=False)
async def health():
    return {"status": "ok"}
