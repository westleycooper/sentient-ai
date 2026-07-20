"""EmbeddingPort — text → dense vector. Adapters: Azure OpenAI, OpenAI, stub."""
from __future__ import annotations

from typing import Protocol


class EmbeddingPort(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...
