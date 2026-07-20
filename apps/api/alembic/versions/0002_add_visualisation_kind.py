"""Add visualisation_kind to sme_templates.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "sme_templates",
        sa.Column("visualisation_kind", sa.String(50), nullable=False, server_default="wave"),
    )


def downgrade() -> None:
    op.drop_column("sme_templates", "visualisation_kind")
