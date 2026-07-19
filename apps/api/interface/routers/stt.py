"""Standalone STT router — transcribe audio without a conversation context.

Used by the agent page to convert mic audio to text before passing it
to the WebSocket agent session.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from interface.dependencies import get_stt_adapter

router = APIRouter(prefix="/stt", tags=["stt"])
logger = logging.getLogger(__name__)


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile, stt=Depends(get_stt_adapter)):
    """Transcribe uploaded audio to text — no conversation required."""
    audio_bytes = await audio.read()
    mime_type = audio.content_type or "audio/webm"
    try:
        text = await stt.transcribe(audio_bytes=audio_bytes, mime_type=mime_type)
    except Exception as exc:
        logger.warning("stt_transcribe_error error=%s", exc)
        raise HTTPException(status_code=502, detail=f"STT failed: {exc}") from exc
    if not text.strip():
        raise HTTPException(status_code=422, detail="No speech detected in audio.")
    return TranscribeResponse(text=text)
