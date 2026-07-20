"""Standalone TTS router — synthesise text without a conversation context."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from interface.dependencies import get_tts_adapter

router = APIRouter(prefix="/tts", tags=["tts"])


class SpeakRequest(BaseModel):
    text: str


@router.post("/speak")
async def speak(body: SpeakRequest, tts=Depends(get_tts_adapter)):
    """Synthesise arbitrary text to audio — no conversation required."""
    async def stream():
        async for chunk in tts.synthesise(text=body.text):
            yield chunk

    return StreamingResponse(stream(), media_type="audio/mpeg")
