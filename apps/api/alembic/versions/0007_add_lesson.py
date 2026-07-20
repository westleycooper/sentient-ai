"""Add lesson to sme_templates.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-21
"""
import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sme_templates",
        sa.Column(
            "lesson",
            sa.JSON,
            nullable=False,
            server_default='{"enabled": false, "visual_verify": true, "questions": []}',
        ),
    )


def downgrade() -> None:
    op.drop_column("sme_templates", "lesson")
