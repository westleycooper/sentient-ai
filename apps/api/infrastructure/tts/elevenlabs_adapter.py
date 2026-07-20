"""ElevenLabsTtsAdapter — streaming TTS via ElevenLabs Turbo."""
from __future__ import annotations

import os
from collections.abc import AsyncIterator

from elevenlabs import AsyncElevenLabs


class ElevenLabsTtsAdapter:
    def __init__(self) -> None:
        self._client = AsyncElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
        self._voice_id = os.environ["ELEVENLABS_VOICE_ID"]
        self._model = os.environ.get("ELEVENLABS_MODEL", "eleven_turbo_v2_5")

    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]:
        stream = await self._client.text_to_speech.convert(
            voice_id=voice or self._voice_id,
            text=text,
            model_id=self._model,
            output_format="mp3_44100_128",
        )
        async for chunk in stream:
            if chunk:
                yield chunk
