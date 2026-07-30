"""Use case: pull (download) a local model, streaming progress."""
from __future__ import annotations

from collections.abc import AsyncIterator

from application.ports.local_model_runtime_port import LocalModelRuntimePort, PullProgressEvent


class PullLocalModelUseCase:
    def __init__(self, runtime: LocalModelRuntimePort) -> None:
        self._runtime = runtime

    async def execute(self, model_tag: str) -> AsyncIterator[PullProgressEvent]:
        async for event in self._runtime.pull(model_tag):
            yield event
