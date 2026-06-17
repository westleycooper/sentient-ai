"""StubTtsAdapter — yields silence bytes for local dev/testing.

Replace with AzureSpeechTtsAdapter or ElevenLabsTtsAdapter for production.
"""
from __future__ import annotations
from typing import AsyncIterator


class StubTtsAdapter:
    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]:
        # Yield a minimal valid WAV header (44 bytes) so the client doesn't error.
        yield b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"
        yield b"\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
