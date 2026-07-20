"""Add agent_config table.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "agent_config",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("working_mode", sa.String(50), nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("auto_allow_tools", sa.JSON, nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("agent_config")
