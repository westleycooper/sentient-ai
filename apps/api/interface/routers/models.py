"""Model selection router: curated frontier catalog + local (Ollama) browser."""
from __future__ import annotations

import json
import logging
import os

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from application.use_cases.delete_local_model import DeleteLocalModelUseCase
from application.use_cases.get_local_model_browser_state import GetLocalModelBrowserStateUseCase
from application.use_cases.pull_local_model import PullLocalModelUseCase
from domain.model_catalog import FRONTIER_MODELS
from interface.dependencies import (
    get_delete_local_model_uc,
    get_local_model_browser_uc,
    get_pull_local_model_uc,
)
from interface.dto import (
    FrontierModelOption,
    LocalModelBrowserResponse,
    LocalModelInfoResponse,
    PullModelRequest,
    RecommendedModelOption,
)

router = APIRouter(prefix="/models", tags=["models"])
logger = logging.getLogger(__name__)


@router.get("/frontier", response_model=list[FrontierModelOption])
async def list_frontier_models():
    return [
        FrontierModelOption(id=m["id"], provider=provider, label=m["label"], description=m["description"])
        for provider, models in FRONTIER_MODELS.items()
        for m in models
    ]


@router.get("/local", response_model=LocalModelBrowserResponse)
async def get_local_models(uc: GetLocalModelBrowserStateUseCase = Depends(get_local_model_browser_uc)):
    state = await uc.execute()
    return LocalModelBrowserResponse(
        runtime_available=state.runtime_available,
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        installed=[
            LocalModelInfoResponse(id=m.id, name=m.name, size_bytes=m.size_bytes, modified_at=m.modified_at)
            for m in state.installed
        ],
        recommended=[RecommendedModelOption(**m) for m in state.recommended],
    )


@router.post("/local/pull")
async def pull_local_model(
    body: PullModelRequest,
    uc: PullLocalModelUseCase = Depends(get_pull_local_model_uc),
):
    """Stream download progress for a local model as Server-Sent Events."""

    async def event_stream():
        try:
            async for event in uc.execute(body.model_tag):
                data = {
                    "type": "progress",
                    "status": event.status,
                    "digest": event.digest,
                    "completed": event.completed,
                    "total": event.total,
                }
                yield f"data: {json.dumps(data)}\n\n"
                if event.done:
                    break
            yield f"data: {json.dumps({'type': 'complete', 'model_tag': body.model_tag})}\n\n"
        except Exception as exc:
            logger.exception("pull_local_model_error", extra={"model_tag": body.model_tag})
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/local/{model_tag:path}", status_code=204)
async def delete_local_model(
    model_tag: str,
    uc: DeleteLocalModelUseCase = Depends(get_delete_local_model_uc),
):
    await uc.execute(model_tag)
