"""StubSttAdapter — returns a fixed transcript for local dev/testing.

Replace with AzureSpeechSttAdapter (infra/stt/azure_speech.py) for production.
"""
from __future__ import annotations


class StubSttAdapter:
    async def transcribe(self, *, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        return "[stub: audio transcription not configured — set STT_PROVIDER=azure]"
