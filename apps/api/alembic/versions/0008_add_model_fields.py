"""Add default_model and use_step_models to sme_templates.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sme_templates",
        sa.Column("default_model", sa.String(200), nullable=True),
    )
    op.add_column(
        "sme_templates",
        sa.Column("use_step_models", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("sme_templates", "use_step_models")
    op.drop_column("sme_templates", "default_model")
