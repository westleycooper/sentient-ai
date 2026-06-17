"""OpenAISttAdapter — Whisper transcription via OpenAI API."""
from __future__ import annotations

import io
import os

from openai import AsyncOpenAI


class OpenAISttAdapter:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        self._model = os.environ.get("STT_OPENAI_MODEL", "whisper-1")

    async def transcribe(self, *, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        ext = mime_type.split("/")[-1].split(";")[0]
        file = (f"audio.{ext}", io.BytesIO(audio_bytes), mime_type)
        response = await self._client.audio.transcriptions.create(
            model=self._model,
            file=file,
        )
        return response.text
