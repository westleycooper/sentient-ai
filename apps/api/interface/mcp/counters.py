"""Process-local, in-memory counters for the MCP status endpoint.
Best-effort only: resets on restart, not aggregated across replicas.
Fine for a local-only, single-process v1 feature (ADR-0004)."""
from __future__ import annotations

_touched_conversation_ids: set[str] = set()


def record_conversation_touch(conversation_id: str) -> None:
    _touched_conversation_ids.add(conversation_id)


def touched_conversation_count() -> int:
    return len(_touched_conversation_ids)
