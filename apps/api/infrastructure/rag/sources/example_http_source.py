"""CANONICAL example: a user-configurable HTTP/JSON RAG source.

Demonstrates: secret via env/Key Vault, pagination, JSON->chunk schema mapping,
error handling, provenance. Implements RetrievalSourcePort. Treat responses as
untrusted (security.md). A contract test must validate this adapter.
"""
from __future__ import annotations
import os
import httpx

from application.ports.retrieval_port import RetrievalSourcePort, RetrievedChunk


class ExampleHttpSource(RetrievalSourcePort):
    def __init__(self, *, source_id: str, url_env: str, auth_secret_ref: str,
                 schema_map: dict | None = None) -> None:
        self._source_id = source_id
        self._base_url = os.environ[url_env]               # injected by env/Key Vault
        self._api_key = _resolve_secret(auth_secret_ref)   # never a literal in code
        self._schema_map = schema_map or {"id": "id", "text": "content"}

    async def retrieve(self, *, query: str, top_k: int) -> list[RetrievedChunk]:
        chunks: list[RetrievedChunk] = []
        page = 1
        async with httpx.AsyncClient(timeout=10.0) as client:
            while len(chunks) < top_k:
                resp = await client.get(
                    self._base_url,
                    params={"q": query, "page": page, "page_size": top_k},
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                resp.raise_for_status()
                items = resp.json().get("items", [])
                if not items:
                    break
                for i, item in enumerate(items):
                    chunks.append(RetrievedChunk(
                        source_id=self._source_id,
                        chunk_id=str(item.get(self._schema_map["id"], f"{page}-{i}")),
                        text=str(item.get(self._schema_map["text"], "")),
                        score=float(item.get("score", 0.0)),
                    ))
                page += 1
        return chunks[:top_k]


def _resolve_secret(ref: str) -> str:
    """Resolve a 'kv:<name>' Key Vault reference. The Azure adapter lives in
    infrastructure/secrets/; locally this reads an env var. Cloud-agnostic."""
    if ref.startswith("kv:"):
        return os.environ[ref.removeprefix("kv:").upper().replace("-", "_")]
    return os.environ[ref]
