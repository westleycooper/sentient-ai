"""The zero-config fallback model — used when neither a step nor its SME
template configures one. Single source of truth so `graph.py` (which uses it
to run reasoning) and `interface/routers/models.py` (which surfaces it to the
UI so "platform default" can show the actual model in use) never drift apart.
"""
from __future__ import annotations

import os

PLATFORM_DEFAULT_MODEL = os.environ.get("REASONING_MODEL", "claude-haiku-4-5-20251001")
