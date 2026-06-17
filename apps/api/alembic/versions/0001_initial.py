"""Initial schema: conversations, messages, sme_templates + pgvector extension.

Revision ID: 0001
Revises:
Create Date: 2026-06-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sme_id", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_conversations_sme_id", "conversations", ["sme_id"])

    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36),
                  sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("token_count", sa.Integer, default=0),
        sa.Column("citations", sa.JSON, default=list),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])

    op.create_table(
        "sme_templates",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("soul", sa.Text, nullable=False),
        sa.Column("steps", sa.JSON, nullable=False),
        sa.Column("sources", sa.JSON, nullable=False),
        sa.Column("rules", sa.JSON, nullable=False),
        sa.Column("is_default", sa.Boolean, default=False),
    )


def downgrade() -> None:
    op.drop_table("sme_templates")
    op.drop_table("messages")
    op.drop_table("conversations")
