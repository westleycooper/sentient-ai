"""Tests for GetLocalModelBrowserStateUseCase. Uses a fake LocalModelRuntimePort."""
from collections.abc import AsyncIterator

import pytest

from application.ports.local_model_runtime_port import LocalModelInfo, PullProgressEvent
from application.use_cases.get_local_model_browser_state import GetLocalModelBrowserStateUseCase


class FakeLocalModelRuntime:
    def __init__(self, *, available: bool = True, installed: list[LocalModelInfo] | None = None):
        self._available = available
        self._installed = installed or []

    async def health(self) -> bool:
        return self._available

    async def list_installed(self) -> list[LocalModelInfo]:
        return self._installed

    async def pull(self, model_tag: str) -> AsyncIterator[PullProgressEvent]:
        yield PullProgressEvent(status="success", done=True)

    async def delete(self, model_tag: str) -> None:
        pass


@pytest.mark.asyncio
async def test_browser_state_when_runtime_up_with_mixed_installed_and_recommended():
    installed = [LocalModelInfo(id="gemma4:e4b", name="gemma4:e4b", size_bytes=1, modified_at="")]
    uc = GetLocalModelBrowserStateUseCase(FakeLocalModelRuntime(available=True, installed=installed))

    state = await uc.execute()

    assert state.runtime_available is True
    assert state.installed == installed
    # gemma4:e4b is already installed, so it's excluded from the recommended shortlist
    assert all(m["tag"] != "gemma4:e4b" for m in state.recommended)
    assert len(state.recommended) > 0


@pytest.mark.asyncio
async def test_browser_state_when_runtime_down_returns_cleanly():
    uc = GetLocalModelBrowserStateUseCase(FakeLocalModelRuntime(available=False))

    state = await uc.execute()

    assert state.runtime_available is False
    assert state.installed == []
    assert len(state.recommended) > 0
