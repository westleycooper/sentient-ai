from __future__ import annotations

from application.ports.agent_config_port import AgentConfigPort
from domain.agent_config import AgentConfig


class SaveAgentConfigUseCase:
    def __init__(self, repo: AgentConfigPort) -> None:
        self._repo = repo

    async def execute(self, config: AgentConfig) -> AgentConfig:
        return await self._repo.save(config)
