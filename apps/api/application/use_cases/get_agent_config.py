from __future__ import annotations
from application.ports.agent_config_port import AgentConfigPort
from domain.agent_config import AgentConfig


class GetAgentConfigUseCase:
    def __init__(self, repo: AgentConfigPort) -> None:
        self._repo = repo

    async def execute(self) -> AgentConfig:
        return await self._repo.get()
