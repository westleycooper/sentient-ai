"""DeepgramSttAdapter — low-latency pre-recorded transcription via Deepgram Nova."""
from __future__ import annotations

import os

from deepgram import AsyncDeepgramClient


class DeepgramSttAdapter:
    def __init__(self) -> None:
        self._client = AsyncDeepgramClient(api_key=os.environ["DEEPGRAM_API_KEY"])
        self._model = os.environ.get("DEEPGRAM_MODEL", "nova-2")

    async def transcribe(self, *, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        response = await self._client.listen.v1.media.transcribe_file(
            request=audio_bytes,
            model=self._model,
            punctuate=True,
            smart_format=True,
        )
        channels = response.results.channels
        if not channels:
            return ""
        alternatives = channels[0].alternatives
        if not alternatives:
            return ""
        return alternatives[0].transcript or ""
