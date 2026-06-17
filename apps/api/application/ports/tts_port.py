"""TtsPort — text-to-speech. Adapters: Azure Speech, ElevenLabs, stub."""
from __future__ import annotations
from typing import AsyncIterator, Protocol


class TtsPort(Protocol):
    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]: ...
