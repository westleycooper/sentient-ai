"""SttPort — speech-to-text. Adapters: Azure Speech, Whisper, stub."""
from __future__ import annotations
from typing import Protocol


class SttPort(Protocol):
    async def transcribe(self, *, audio_bytes: bytes, mime_type: str = "audio/webm") -> str: ...
