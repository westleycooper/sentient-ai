"""Add rules and sources columns to agent_config.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "agent_config",
        sa.Column("rules", sa.JSON, nullable=False, server_default="[]"),
    )
    op.add_column(
        "agent_config",
        sa.Column("sources", sa.JSON, nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("agent_config", "sources")
    op.drop_column("agent_config", "rules")
