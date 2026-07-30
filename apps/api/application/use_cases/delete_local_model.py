"""Use case: delete a downloaded local model."""
from __future__ import annotations

from application.ports.local_model_runtime_port import LocalModelRuntimePort


class DeleteLocalModelUseCase:
    def __init__(self, runtime: LocalModelRuntimePort) -> None:
        self._runtime = runtime

    async def execute(self, model_tag: str) -> None:
        await self._runtime.delete(model_tag)
