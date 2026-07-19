"""REST endpoints for the coding agent configuration.

GET  /agent/config  — retrieve current config (returns defaults if never saved)
PUT  /agent/config  — upsert config
GET  /agent/models  — list available models for the frontend selector
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from application.use_cases.get_agent_config import GetAgentConfigUseCase
from application.use_cases.save_agent_config import SaveAgentConfigUseCase
from domain.agent_config import AVAILABLE_MODELS, AgentConfig
from interface.dependencies import get_agent_config_uc, get_save_agent_config_uc

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentConfigBody(BaseModel):
    model: str
    working_mode: str
    system_prompt: str
    auto_allow_tools: list[str]
    rules: list[dict] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    theme_id: str = "dark-teal"


class AgentConfigResponse(BaseModel):
    model: str
    working_mode: str
    system_prompt: str
    auto_allow_tools: list[str]
    rules: list[dict] = Field(default_factory=list)
    sources: list[dict] = Field(default_factory=list)
    theme_id: str = "dark-teal"

    @classmethod
    def from_domain(cls, c: AgentConfig) -> "AgentConfigResponse":
        return cls(
            model=c.model,
            working_mode=c.working_mode,
            system_prompt=c.system_prompt,
            auto_allow_tools=c.auto_allow_tools,
            rules=list(c.rules),
            sources=list(c.sources),
            theme_id=c.theme_id,
        )


class ModelInfo(BaseModel):
    id: str
    label: str
    description: str


@router.get("/models", response_model=list[ModelInfo])
async def list_models():
    """Available models for the code agent selector."""
    return [ModelInfo(**m) for m in AVAILABLE_MODELS]


@router.get("/config", response_model=AgentConfigResponse)
async def get_config(uc: GetAgentConfigUseCase = Depends(get_agent_config_uc)):
    config = await uc.execute()
    return AgentConfigResponse.from_domain(config)


@router.put("/config", response_model=AgentConfigResponse)
async def update_config(
    body: AgentConfigBody,
    uc: SaveAgentConfigUseCase = Depends(get_save_agent_config_uc),
):
    config = AgentConfig(
        model=body.model,
        working_mode=body.working_mode,
        system_prompt=body.system_prompt,
        auto_allow_tools=body.auto_allow_tools,
        rules=body.rules,
        sources=body.sources,
        theme_id=body.theme_id,
    )
    saved = await uc.execute(config)
    return AgentConfigResponse.from_domain(saved)
