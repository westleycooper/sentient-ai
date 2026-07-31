"""Upsert the default SME templates from sentient_domain into Postgres.

Run once after `alembic upgrade head`, and any time the domain defaults change:
    uv run python scripts/seed_defaults.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent.parent / ".env.local")

import psycopg
from sentient_domain.sme import DEFAULT_TEMPLATES


def _row(t) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "soul": t.soul,
        "steps": json.dumps([s.model_dump() for s in t.steps]),
        "sources": json.dumps([s.model_dump() for s in t.sources]),
        "rules": json.dumps([r.model_dump() for r in t.rules]),
        "is_default": t.is_default,
        "lesson": json.dumps(t.lesson.model_dump()),
        "visualisation_kind": t.visualisation_kind,
        "user_visualisation_kind": t.user_visualisation_kind,
        "theme_id": t.theme_id,
        "default_model": t.default_model,
        "use_step_models": t.use_step_models,
    }


def main() -> None:
    url = os.environ["DATABASE_URL"]
    # psycopg v3 uses postgresql:// natively
    url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg://", "postgresql://")

    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            for t in DEFAULT_TEMPLATES:
                row = _row(t)
                cur.execute(
                    """
                    INSERT INTO sme_templates
                        (id, name, soul, steps, sources, rules, is_default, lesson, visualisation_kind,
                         user_visualisation_kind, theme_id, default_model, use_step_models)
                    VALUES
                        (%(id)s, %(name)s, %(soul)s, %(steps)s::jsonb, %(sources)s::jsonb, %(rules)s::jsonb,
                         %(is_default)s, %(lesson)s::jsonb, %(visualisation_kind)s, %(user_visualisation_kind)s,
                         %(theme_id)s, %(default_model)s, %(use_step_models)s)
                    ON CONFLICT (id) DO UPDATE SET
                        name                     = EXCLUDED.name,
                        soul                     = EXCLUDED.soul,
                        steps                    = EXCLUDED.steps,
                        sources                  = EXCLUDED.sources,
                        rules                    = EXCLUDED.rules,
                        is_default               = EXCLUDED.is_default,
                        lesson                   = EXCLUDED.lesson,
                        visualisation_kind       = EXCLUDED.visualisation_kind,
                        user_visualisation_kind  = EXCLUDED.user_visualisation_kind,
                        theme_id                 = EXCLUDED.theme_id,
                        default_model            = EXCLUDED.default_model,
                        use_step_models          = EXCLUDED.use_step_models
                    """,
                    row,
                )
                print(f"  upserted: {t.id} ({t.name})")
        conn.commit()
    print("Done.")


if __name__ == "__main__":
    main()
