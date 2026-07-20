"""DeepgramTtsAdapter — TTS via Deepgram Aura model."""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

import httpx


class DeepgramTtsAdapter:
    """Uses Deepgram's TTS REST API directly via httpx (no SDK wrapper needed for TTS)."""

    _BASE = "https://api.deepgram.com/v1/speak"

    def __init__(self) -> None:
        self._api_key = os.environ["DEEPGRAM_API_KEY"]
        # Aura voices: aura-asteria-en, aura-luna-en, aura-stella-en, aura-athena-en,
        #              aura-hera-en, aura-orion-en, aura-arcas-en, aura-perseus-en,
        #              aura-angus-en, aura-orpheus-en, aura-helios-en, aura-zeus-en
        self._model = os.environ.get("DEEPGRAM_TTS_MODEL", "aura-asteria-en")

    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]:
        model = voice or self._model
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream(
                "POST",
                self._BASE,
                params={"model": model},
                headers={
                    "Authorization": f"Token {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={"text": text},
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    if chunk:
                        yield chunk
