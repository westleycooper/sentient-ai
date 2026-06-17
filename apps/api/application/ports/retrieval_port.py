"""RetrievalSourcePort — both HTTP-API and JSON-set sources implement this."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RetrievedChunk:
    source_id: str
    chunk_id: str
    text: str
    score: float


class RetrievalSourcePort(Protocol):
    async def retrieve(self, *, query: str, top_k: int) -> list[RetrievedChunk]: ...
