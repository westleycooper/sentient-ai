"""Add RAG vector store tables for JSON_SET source ingestion.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str = "0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Ensure pgvector extension (idempotent — already created in 0001)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "rag_sources",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("sme_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(50), nullable=False),
        sa.Column("config", sa.JSON, nullable=False, default=dict),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("chunk_count", sa.Integer, default=0),
    )
    op.create_index("ix_rag_sources_sme_id", "rag_sources", ["sme_id"])

    # Use Text column for embedding — store as pgvector type via raw DDL
    op.create_table(
        "rag_chunks",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("metadata", sa.JSON, default=dict),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column(
        "rag_chunks",
        sa.Column("embedding", sa.Text, nullable=True),  # placeholder — altered below
    )
    # Replace with real vector column (1536 dims for text-embedding-3-small)
    op.execute("ALTER TABLE rag_chunks ALTER COLUMN embedding TYPE vector(1536) USING NULL::vector(1536)")
    op.execute(
        "CREATE INDEX ix_rag_chunks_embedding ON rag_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    # Full-text search index for hybrid retrieval
    op.execute(
        "CREATE INDEX ix_rag_chunks_fts ON rag_chunks USING gin(to_tsvector('english', text))"
    )
    op.create_index("ix_rag_chunks_source_id", "rag_chunks", ["source_id"])


def downgrade() -> None:
    op.drop_table("rag_chunks")
    op.drop_table("rag_sources")
