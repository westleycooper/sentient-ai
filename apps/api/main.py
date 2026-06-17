"""Sentinel API — FastAPI entrypoint. One responsibility: wiring and startup."""
from __future__ import annotations

import os
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

app = FastAPI(
    title="Sentinel API",
    version="0.1.0",
    description="Multi-reasoning voice agent platform. OpenAPI schema is committed to packages/contracts/.",
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
