"""PostgresAgentConfigRepo — single-row agent config persisted in Postgres."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from application.ports.agent_config_port import AgentConfigPort
from domain.agent_config import AgentConfig
from infrastructure.persistence.models import AgentConfigModel

_ROW_ID = "default"


class PostgresAgentConfigRepo(AgentConfigPort):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self) -> AgentConfig:
        row = await self._session.get(AgentConfigModel, _ROW_ID)
        if row is None:
            return AgentConfig()   # return domain defaults if no row yet
        return AgentConfig(
            model=row.model,
            working_mode=row.working_mode,
            system_prompt=row.system_prompt,
            auto_allow_tools=list(row.auto_allow_tools or []),
            rules=list(row.rules or []),
            sources=list(row.sources or []),
            theme_id=row.theme_id or "dark-teal",
        )

    async def save(self, config: AgentConfig) -> AgentConfig:
        row = await self._session.get(AgentConfigModel, _ROW_ID)
        if row is None:
            row = AgentConfigModel(id=_ROW_ID)
            self._session.add(row)
        row.model = config.model
        row.working_mode = config.working_mode
        row.system_prompt = config.system_prompt
        row.auto_allow_tools = list(config.auto_allow_tools)
        row.rules = list(config.rules)
        row.sources = list(config.sources)
        row.theme_id = config.theme_id
        await self._session.commit()
        return config
