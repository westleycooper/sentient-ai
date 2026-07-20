#!/usr/bin/env python3
"""PostToolUse hook: mechanically enforce the apps/api DDD layer-boundary rules
from CLAUDE.md §3 / .claude/commands/check-boundaries.md, the moment a domain/
or application/ file is edited (rather than only at review time via /check-boundaries).

  - domain/ must not import: fastapi, sqlalchemy, langchain, langgraph, azure.*,
    or any provider SDK.
  - application/ must not import infrastructure/ or interface/, nor any external
    SDK; only domain + its own ports.

Reads a PostToolUse hook payload on stdin. Exit 2 (blocking, stderr fed back to
Claude) on a violation; exit 0 otherwise.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

DISALLOWED_ANYWHERE = {
    "fastapi", "sqlalchemy", "langchain", "langgraph", "azure",
    "anthropic", "openai", "deepgram", "elevenlabs",
    "psycopg", "asyncpg", "alembic", "opentelemetry", "sse_starlette",
    "boto3", "google",
}
DISALLOWED_APPLICATION_ONLY = {"infrastructure", "interface"}


def top_level_module(name: str) -> str:
    return name.split(".", 1)[0]


def find_violations(file_path: Path, layer: str) -> list[tuple[int, str]]:
    try:
        tree = ast.parse(file_path.read_text(), filename=str(file_path))
    except (SyntaxError, OSError):
        return []

    disallowed = set(DISALLOWED_ANYWHERE)
    if layer == "application":
        disallowed |= DISALLOWED_APPLICATION_ONLY

    violations: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = top_level_module(alias.name)
                if mod in disallowed:
                    violations.append((node.lineno, mod))
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                mod = top_level_module(node.module)
                if mod in disallowed:
                    violations.append((node.lineno, mod))
    return violations


def main() -> int:
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input", {})
    file_path_str = tool_input.get("file_path")
    if not file_path_str:
        return 0

    file_path = Path(file_path_str)
    if not file_path.is_file() or file_path.suffix != ".py":
        return 0

    parts = file_path.parts
    if "apps" not in parts or "api" not in parts:
        return 0
    api_idx = parts.index("api")
    remainder = parts[api_idx + 1:]
    if not remainder:
        return 0

    layer = remainder[0]
    if layer not in ("domain", "application"):
        return 0

    violations = find_violations(file_path, layer)
    if not violations:
        return 0

    print(
        f"DDD boundary violation in {file_path} (CLAUDE.md §3 — {layer}/ layering rule):",
        file=sys.stderr,
    )
    for lineno, mod in violations:
        print(f"  {file_path}:{lineno} imports `{mod}` — not allowed in {layer}/", file=sys.stderr)
    print(
        "Fix: move this import behind a port in application/ports/ and inject an "
        "infrastructure/ adapter at the composition root, rather than importing it "
        f"directly from {layer}/.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
