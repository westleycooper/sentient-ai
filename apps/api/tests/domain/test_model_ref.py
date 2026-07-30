"""Tests for the namespaced model-id parser."""
import pytest
from sentient_domain.model_ref import parse_model_ref


@pytest.mark.parametrize(
    "ref, expected",
    [
        ("anthropic:claude-sonnet-5", ("anthropic", "claude-sonnet-5")),
        ("openai:gpt-5.1", ("openai", "gpt-5.1")),
        ("google:gemini-3-pro", ("google", "gemini-3-pro")),
        ("ollama:gemma3:12b", ("ollama", "gemma3:12b")),
        ("claude-haiku-4-5-20251001", ("anthropic", "claude-haiku-4-5-20251001")),
        ("", ("anthropic", "")),
    ],
)
def test_parse_model_ref(ref, expected):
    assert parse_model_ref(ref) == expected
