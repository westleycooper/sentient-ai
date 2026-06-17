"""OpenAITtsAdapter — streaming TTS via OpenAI tts-1-hd."""
from __future__ import annotations

import os
from typing import AsyncIterator

from openai import AsyncOpenAI


class OpenAITtsAdapter:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self._model = os.environ.get("TTS_OPENAI_MODEL", "tts-1-hd")
        self._voice = os.environ.get("TTS_OPENAI_VOICE", "nova")

    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]:
        async with self._client.audio.speech.with_streaming_response.create(
            model=self._model,
            voice=voice or self._voice,
            input=text,
            response_format="mp3",
        ) as response:
            async for chunk in response.iter_bytes(chunk_size=4096):
                yield chunk
