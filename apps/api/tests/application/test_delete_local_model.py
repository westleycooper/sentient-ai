"""Tests for DeleteLocalModelUseCase. Uses a fake LocalModelRuntimePort."""
from collections.abc import AsyncIterator

import pytest

from application.ports.local_model_runtime_port import PullProgressEvent
from application.use_cases.delete_local_model import DeleteLocalModelUseCase


class FakeLocalModelRuntime:
    def __init__(self):
        self.deleted_tags: list[str] = []

    async def health(self) -> bool:
        return True

    async def list_installed(self) -> list:
        return []

    async def pull(self, model_tag: str) -> AsyncIterator[PullProgressEvent]:
        return
        yield  # pragma: no cover — makes this an async generator

    async def delete(self, model_tag: str) -> None:
        self.deleted_tags.append(model_tag)


@pytest.mark.asyncio
async def test_delete_calls_runtime_with_tag():
    runtime = FakeLocalModelRuntime()
    uc = DeleteLocalModelUseCase(runtime)

    await uc.execute("gemma3:12b")

    assert runtime.deleted_tags == ["gemma3:12b"]
