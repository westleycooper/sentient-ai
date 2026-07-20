"""Tests for interface/mcp/counters.py dedup behaviour."""
from __future__ import annotations

from interface.mcp import counters


def test_touched_conversation_count_starts_at_zero(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    assert counters.touched_conversation_count() == 0


def test_record_conversation_touch_dedupes(monkeypatch):
    monkeypatch.setattr(counters, "_touched_conversation_ids", set())
    counters.record_conversation_touch("conv-1")
    counters.record_conversation_touch("conv-1")
    counters.record_conversation_touch("conv-2")
    assert counters.touched_conversation_count() == 2
