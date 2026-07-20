"""Conversations router: create session, retrieve history, stream a turn via SSE."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from application.use_cases.process_turn import ProcessTurnUseCase
from application.use_cases.start_conversation import StartConversationUseCase
from interface.dependencies import (
    get_conv_repo,
    get_process_turn_uc,
    get_start_conversation_uc,
    get_stt_adapter,
    get_tts_adapter,
)
from interface.dto import (
    ConversationResponse,
    MessageResponse,
    StartConversationRequest,
    StartConversationResponse,
    TurnErrorEventResponse,
    TurnRequest,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)


@router.post("", response_model=StartConversationResponse, status_code=201)
async def start_conversation(
    body: StartConversationRequest,
    uc: StartConversationUseCase = Depends(get_start_conversation_uc),
):
    try:
        conv = await uc.execute(sme_id=body.sme_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StartConversationResponse(
        conversation_id=conv.id,
        sme_id=conv.sme_id,
        created_at=conv.created_at,
    )


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str, repo=Depends(get_conv_repo)):
    conv = await repo.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationResponse(
        id=conv.id,
        sme_id=conv.sme_id,
        created_at=conv.created_at,
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role.value,
                content=m.content,
                created_at=m.created_at,
                token_count=m.token_count,
                citations=m.citations,
            )
            for m in conv.messages
        ],
    )


@router.post("/{conversation_id}/turn")
async def process_turn(
    conversation_id: str,
    body: TurnRequest,
    uc: ProcessTurnUseCase = Depends(get_process_turn_uc),
):
    """
    Stream reasoning step events + final answer as Server-Sent Events.

    Each event is a JSON object with a `type` field:
    - `step` — a ReasoningStepEvent (step_id, step_name, phase, tokens, latency…)
    - `complete` — final answer with total token count and citations
    - `error` — something went wrong
    """

    async def event_stream():
        try:
            state: dict = {}
            emitted = 0
            async for partial in uc.execute(
                conversation_id=conversation_id, user_text=body.user_text
            ):
                state.update(partial)
                events = state.get("events", [])
                for ev in events[emitted:]:
                    data = {
                        "type": "step",
                        "step_id": ev.step_id,
                        "step_name": ev.step_name,
                        "phase": ev.phase,
                        "latency_ms": ev.latency_ms,
                        "prompt_tokens": ev.prompt_tokens,
                        "completion_tokens": ev.completion_tokens,
                        "total_tokens": ev.total_tokens,
                        "model": ev.model,
                        "estimated_cost": ev.estimated_cost,
                        "output_preview": ev.output_preview,
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                emitted = len(events)

            complete = {
                "type": "complete",
                "answer": state.get("answer", ""),
                "total_tokens": state.get("token_total", 0),
                "citations": state.get("citations", []),
            }
            yield f"data: {json.dumps(complete)}\n\n"

        except ValueError as exc:
            err = TurnErrorEventResponse(message=str(exc))
            yield f"data: {json.dumps(err.model_dump())}\n\n"
        except Exception:
            logger.exception("turn_stream_error", extra={"conversation_id": conversation_id})
            err = TurnErrorEventResponse(message="Internal error — see server logs.")
            yield f"data: {json.dumps(err.model_dump())}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{conversation_id}/audio-turn")
async def process_audio_turn(
    conversation_id: str,
    audio: UploadFile,
    uc: ProcessTurnUseCase = Depends(get_process_turn_uc),
    stt=Depends(get_stt_adapter),
    tts=Depends(get_tts_adapter),
):
    """
    Accept audio upload, transcribe via STT, stream SSE reasoning events, then
    stream TTS audio back.

    Flow: audio bytes → STT → ProcessTurn (SSE events) → answer text → TTS audio stream.
    Two responses can't be combined, so this endpoint streams SSE events AND
    a separate /audio-turn/tts endpoint serves the audio once the answer is known.
    For now: transcribe + run turn SSE exactly like /turn. Client plays TTS separately.
    """
    audio_bytes = await audio.read()
    mime_type = audio.content_type or "audio/webm"

    try:
        user_text = await stt.transcribe(audio_bytes=audio_bytes, mime_type=mime_type)
    except Exception as exc:
        logger.exception("stt_error", extra={"conversation_id": conversation_id})
        raise HTTPException(status_code=502, detail=f"STT failed: {exc}") from exc

    if not user_text.strip():
        raise HTTPException(status_code=422, detail="Could not transcribe audio — no speech detected.")

    async def event_stream():
        # Emit the transcript first so the UI can show it immediately
        yield f"data: {json.dumps({'type': 'transcript', 'text': user_text})}\n\n"
        try:
            state: dict = {}
            emitted = 0
            async for partial in uc.execute(conversation_id=conversation_id, user_text=user_text):
                state.update(partial)
                events = state.get("events", [])
                for ev in events[emitted:]:
                    data = {
                        "type": "step",
                        "step_id": ev.step_id,
                        "step_name": ev.step_name,
                        "phase": ev.phase,
                        "latency_ms": ev.latency_ms,
                        "prompt_tokens": ev.prompt_tokens,
                        "completion_tokens": ev.completion_tokens,
                        "total_tokens": ev.total_tokens,
                        "model": ev.model,
                        "estimated_cost": ev.estimated_cost,
                        "output_preview": ev.output_preview,
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                emitted = len(events)

            answer = state.get("answer", "")
            complete = {
                "type": "complete",
                "answer": answer,
                "total_tokens": state.get("token_total", 0),
                "citations": state.get("citations", []),
            }
            yield f"data: {json.dumps(complete)}\n\n"

        except Exception:
            logger.exception("audio_turn_stream_error", extra={"conversation_id": conversation_id})
            yield f"data: {json.dumps({'type': 'error', 'message': 'Internal error'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{conversation_id}/tts")
async def synthesise_text(
    conversation_id: str,
    body: TurnRequest,
    tts=Depends(get_tts_adapter),
):
    """
    Convert answer text to speech. Called by the frontend after receiving the
    'complete' SSE event. Streams audio bytes back (mp3).
    """
    async def audio_stream():
        async for chunk in tts.synthesise(text=body.user_text):
            yield chunk

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")
