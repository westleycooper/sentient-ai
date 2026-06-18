"""EmbeddingPort adapters: OpenAI (production) and stub (development/testing)."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


class OpenAIEmbeddingAdapter:
    """Uses OpenAI text-embedding-3-small. Requires OPENAI_API_KEY."""

    MODEL = "text-embedding-3-small"
    DIMENSIONS = 1536

    def __init__(self) -> None:
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = await self._client.embeddings.create(
            model=self.MODEL,
            input=texts,
            encoding_format="float",
        )
        return [item.embedding for item in resp.data]


class StubEmbeddingAdapter:
    """Zero-vector stub for use when no embedding API is available.

    Not useful for real retrieval but allows the system to boot and run
    without an OPENAI_API_KEY configured.
    """

    DIMENSIONS = 1536

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * self.DIMENSIONS for _ in texts]


def make_embedding_adapter():
    """Factory: use OpenAI if key is present, else stub."""
    if os.environ.get("OPENAI_API_KEY"):
        return OpenAIEmbeddingAdapter()
    logger.warning(
        "OPENAI_API_KEY not set — using stub embedder; JSON_SET retrieval will not rank by relevance"
    )
    return StubEmbeddingAdapter()
