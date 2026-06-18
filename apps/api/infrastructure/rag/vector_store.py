"""VectorStoreRetriever — pgvector hybrid search for JSON_SET sources.

Ingest: chunk → embed → store in rag_chunks.
Retrieve: vector similarity (cosine) + full-text search, fused with RRF.

All SQL uses SQLAlchemy parameterized queries (CLAUDE.md §9 — no string-built SQL).
Vectors are internally-generated float lists; f-string formatting is safe for those.
"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncEngine

from application.ports.retrieval_port import RetrievedChunk

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 512   # characters
_CHUNK_OVERLAP = 64


class VectorStoreRetriever:
    def __init__(
        self,
        *,
        engine: AsyncEngine,
        embedder,
        source_ids: list[str],
    ) -> None:
        self._engine = engine
        self._embedder = embedder
        self._source_ids = source_ids

    async def retrieve(self, *, query: str, top_k: int) -> list[RetrievedChunk]:
        if not self._source_ids:
            return []

        q_vecs = await self._embedder.embed([query])
        if not q_vecs or not q_vecs[0]:
            return []
        q_vec = q_vecs[0]

        # Vector is internally generated floats — f-string safe
        vector_str = "[" + ",".join(f"{v:.6f}" for v in q_vec) + "]"
        lim = top_k * 2

        # source_ids are admin-configured identifiers, not user input
        # but user query goes through parameterized plainto_tsquery
        _sids_expanding = bindparam("sids", expanding=True)

        vector_stmt = text("""
            SELECT id, source_id, text,
                   1 - (embedding <=> CAST(:vec AS vector)) AS vec_score
            FROM rag_chunks
            WHERE source_id IN :sids
              AND embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:vec AS vector)
            LIMIT :lim
        """).bindparams(_sids_expanding)

        fts_stmt = text("""
            SELECT id, source_id, text,
                   ts_rank_cd(to_tsvector('english', text),
                              plainto_tsquery('english', :query)) AS fts_score
            FROM rag_chunks
            WHERE source_id IN :sids
              AND to_tsvector('english', text) @@ plainto_tsquery('english', :query)
            ORDER BY fts_score DESC
            LIMIT :lim
        """).bindparams(_sids_expanding)

        async with self._engine.connect() as conn:
            vec_rows = (await conn.execute(
                vector_stmt, {"vec": vector_str, "sids": self._source_ids, "lim": lim}
            )).fetchall()
            try:
                fts_rows = (await conn.execute(
                    fts_stmt, {"query": query, "sids": self._source_ids, "lim": lim}
                )).fetchall()
            except Exception as exc:
                logger.warning("vector_store: FTS search failed — %s", exc)
                fts_rows = []

        # Reciprocal Rank Fusion
        rrf_scores: dict[str, float] = {}
        rrf_chunks: dict[str, tuple[str, str]] = {}
        K = 60

        for rank, row in enumerate(vec_rows):
            chunk_id, src_id, chunk_text = str(row[0]), str(row[1]), str(row[2])
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (K + rank + 1)
            rrf_chunks[chunk_id] = (src_id, chunk_text)

        for rank, row in enumerate(fts_rows):
            chunk_id, src_id, chunk_text = str(row[0]), str(row[1]), str(row[2])
            rrf_scores[chunk_id] = rrf_scores.get(chunk_id, 0.0) + 1.0 / (K + rank + 1)
            rrf_chunks[chunk_id] = (src_id, chunk_text)

        sorted_ids = sorted(rrf_scores, key=lambda k: rrf_scores[k], reverse=True)

        return [
            RetrievedChunk(
                source_id=rrf_chunks[cid][0],
                chunk_id=cid,
                text=rrf_chunks[cid][1],
                score=round(rrf_scores[cid], 4),
            )
            for cid in sorted_ids[:top_k]
        ]

    async def ingest(self, *, source_id: str, documents: list[dict | str]) -> int:
        """Chunk, embed, and store documents. Returns number of chunks stored."""
        chunks: list[str] = []
        for doc in documents:
            raw = doc if isinstance(doc, str) else json.dumps(doc)
            chunks.extend(_chunk_text(raw))

        if not chunks:
            return 0

        embeddings = await self._embedder.embed(chunks)

        delete_stmt = text("DELETE FROM rag_chunks WHERE source_id = :source_id")
        insert_stmt = text("""
            INSERT INTO rag_chunks (id, source_id, chunk_index, text, embedding)
            VALUES (:chunk_id, :source_id, :idx, :chunk_text, CAST(:vec AS vector))
        """)

        async with self._engine.begin() as conn:
            await conn.execute(delete_stmt, {"source_id": source_id})
            for i, (chunk_text, emb) in enumerate(zip(chunks, embeddings)):
                vec_str = "[" + ",".join(f"{v:.6f}" for v in emb) + "]"
                await conn.execute(insert_stmt, {
                    "chunk_id": str(uuid.uuid4()),
                    "source_id": source_id,
                    "idx": i,
                    "chunk_text": chunk_text,
                    "vec": vec_str,
                })

        return len(chunks)


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        start += size - overlap
    return chunks
