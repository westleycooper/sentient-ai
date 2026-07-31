"""Add user_visualisation_kind to sme_templates.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-31
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "sme_templates",
        sa.Column("user_visualisation_kind", sa.String(50), nullable=False, server_default="wave"),
    )


def downgrade() -> None:
    op.drop_column("sme_templates", "user_visualisation_kind")
