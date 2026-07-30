"""Tests for PullLocalModelUseCase. Uses a fake LocalModelRuntimePort."""
from collections.abc import AsyncIterator

import pytest

from application.ports.local_model_runtime_port import PullProgressEvent
from application.use_cases.pull_local_model import PullLocalModelUseCase


class FakeLocalModelRuntime:
    def __init__(self, events: list[PullProgressEvent]):
        self._events = events
        self.pulled_tags: list[str] = []

    async def health(self) -> bool:
        return True

    async def list_installed(self) -> list:
        return []

    async def pull(self, model_tag: str) -> AsyncIterator[PullProgressEvent]:
        self.pulled_tags.append(model_tag)
        for event in self._events:
            yield event

    async def delete(self, model_tag: str) -> None:
        pass


@pytest.mark.asyncio
async def test_pull_streams_progress_events_in_order():
    events = [
        PullProgressEvent(status="pulling", completed=10, total=100),
        PullProgressEvent(status="pulling", completed=100, total=100),
        PullProgressEvent(status="success", done=True),
    ]
    runtime = FakeLocalModelRuntime(events)
    uc = PullLocalModelUseCase(runtime)

    received = [e async for e in uc.execute("gemma3:12b")]

    assert received == events
    assert runtime.pulled_tags == ["gemma3:12b"]
    assert received[-1].done is True
