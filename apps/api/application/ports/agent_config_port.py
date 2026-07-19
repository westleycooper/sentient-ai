"""AgentConfigPort — abstract interface for persisting/retrieving the agent config."""
from __future__ import annotations

from abc import ABC, abstractmethod

from domain.agent_config import AgentConfig


class AgentConfigPort(ABC):
    @abstractmethod
    async def get(self) -> AgentConfig: ...

    @abstractmethod
    async def save(self, config: AgentConfig) -> AgentConfig: ...
