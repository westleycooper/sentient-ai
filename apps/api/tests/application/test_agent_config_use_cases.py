"""Tests for GetAgentConfigUseCase / SaveAgentConfigUseCase. Fake port, no DB."""
import pytest

from application.use_cases.get_agent_config import GetAgentConfigUseCase
from application.use_cases.save_agent_config import SaveAgentConfigUseCase
from domain.agent_config import AgentConfig


class FakeAgentConfigRepo:
    def __init__(self, config: AgentConfig | None = None):
        self._config = config or AgentConfig()

    async def get(self) -> AgentConfig:
        return self._config

    async def save(self, config: AgentConfig) -> AgentConfig:
        self._config = config
        return self._config


@pytest.mark.asyncio
async def test_get_agent_config_returns_stored_config():
    repo = FakeAgentConfigRepo(AgentConfig(model="claude-opus-4-8"))
    uc = GetAgentConfigUseCase(repo)
    result = await uc.execute()
    assert result.model == "claude-opus-4-8"


@pytest.mark.asyncio
async def test_save_agent_config_persists_and_returns():
    repo = FakeAgentConfigRepo()
    uc = SaveAgentConfigUseCase(repo)
    new_config = AgentConfig(model="claude-haiku-4-5-20251001", working_mode="frontend_only")
    result = await uc.execute(new_config)

    assert result is new_config
    stored = await repo.get()
    assert stored.model == "claude-haiku-4-5-20251001"
    assert stored.working_mode == "frontend_only"
