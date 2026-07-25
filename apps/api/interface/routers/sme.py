"""SME template CRUD router."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sentient_domain.sme import (
    LessonConfig,
    ReasoningStep,
    RetrievalSourceConfig,
    SmeRule,
    SmeTemplate,
)

from application.use_cases.delete_sme_template import DeleteSmeTemplateUseCase
from application.use_cases.get_sme_templates import GetSmeTemplatesUseCase
from application.use_cases.save_sme_template import SaveSmeTemplateUseCase
from interface.dependencies import get_delete_sme_uc, get_get_sme_uc, get_save_sme_uc
from interface.dto import SaveSmeTemplateRequest, SmeTemplateResponse

router = APIRouter(prefix="/sme", tags=["sme"])


@router.get("", response_model=list[SmeTemplateResponse])
async def list_sme_templates(uc: GetSmeTemplatesUseCase = Depends(get_get_sme_uc)):
    templates = await uc.execute()
    return [SmeTemplateResponse.from_domain(t) for t in templates]


@router.get("/{template_id}", response_model=SmeTemplateResponse)
async def get_sme_template(template_id: str, uc: GetSmeTemplatesUseCase = Depends(get_get_sme_uc)):
    templates = await uc.execute()
    match = next((t for t in templates if t.id == template_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return SmeTemplateResponse.from_domain(match)


@router.put("/{template_id}", response_model=SmeTemplateResponse, status_code=status.HTTP_200_OK)
async def save_sme_template(
    template_id: str,
    body: SaveSmeTemplateRequest,
    uc: SaveSmeTemplateUseCase = Depends(get_save_sme_uc),
):
    if body.id != template_id:
        raise HTTPException(status_code=422, detail="Route id and body id must match")
    template = SmeTemplate(
        id=body.id,
        name=body.name,
        soul=body.soul,
        steps=[ReasoningStep(**s) for s in body.steps],
        sources=[RetrievalSourceConfig(**s) for s in body.sources],
        rules=[SmeRule(**r) for r in body.rules],
        is_default=body.is_default,
        visualisation_kind=body.visualisation_kind,
        theme_id=body.theme_id,
        lesson=LessonConfig(**body.lesson) if body.lesson else LessonConfig(),
    )
    saved = await uc.execute(template)
    return SmeTemplateResponse.from_domain(saved)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sme_template(
    template_id: str,
    uc: DeleteSmeTemplateUseCase = Depends(get_delete_sme_uc),
):
    try:
        await uc.execute(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
