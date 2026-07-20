"""Add theme_id to sme_templates and agent_config.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sme_templates",
        sa.Column("theme_id", sa.String(100), nullable=False, server_default="dark-teal"),
    )
    op.add_column(
        "agent_config",
        sa.Column("theme_id", sa.String(100), nullable=False, server_default="dark-teal"),
    )


def downgrade() -> None:
    op.drop_column("sme_templates", "theme_id")
    op.drop_column("agent_config", "theme_id")
