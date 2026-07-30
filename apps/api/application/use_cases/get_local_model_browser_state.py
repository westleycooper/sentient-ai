"""Use case: assemble everything the local-models browser tab needs in one call."""
from __future__ import annotations

from dataclasses import dataclass

from application.ports.local_model_runtime_port import LocalModelInfo, LocalModelRuntimePort
from domain.model_catalog import RECOMMENDED_OLLAMA_MODELS


@dataclass(frozen=True)
class LocalModelBrowserState:
    runtime_available: bool
    installed: list[LocalModelInfo]
    recommended: list[dict]


class GetLocalModelBrowserStateUseCase:
    def __init__(self, runtime: LocalModelRuntimePort) -> None:
        self._runtime = runtime

    async def execute(self) -> LocalModelBrowserState:
        available = await self._runtime.health()
        installed = await self._runtime.list_installed() if available else []
        installed_tags = {m.name for m in installed}
        recommended = [m for m in RECOMMENDED_OLLAMA_MODELS if m["tag"] not in installed_tags]
        return LocalModelBrowserState(
            runtime_available=available,
            installed=installed,
            recommended=recommended,
        )
