"""Domain layer tests — Conversation aggregate invariants. ≥90% coverage required."""
import pytest
from domain.conversation import (
    Conversation,
    DomainError,
    MessageRole,
    TurnCompletedEvent,
    ConversationStartedEvent,
)


def test_add_user_turn_creates_message():
    conv = Conversation(sme_id="test-sme")
    msg = conv.add_user_turn(text="Hello")
    assert msg.role == MessageRole.USER
    assert msg.content == "Hello"
    assert len(conv.messages) == 1


def test_add_assistant_turn_after_user():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Hello")
    msg = conv.add_assistant_turn(text="Hi there", token_count=10)
    assert msg.role == MessageRole.ASSISTANT
    assert msg.token_count == 10


def test_consecutive_user_turns_raise_domain_error():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="First")
    with pytest.raises(DomainError):
        conv.add_user_turn(text="Second")


def test_consecutive_assistant_turns_raise_domain_error():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Hello")
    conv.add_assistant_turn(text="Hi")
    with pytest.raises(DomainError):
        conv.add_assistant_turn(text="Also hi")


def test_turn_completed_event_emitted():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Hello")
    conv.add_assistant_turn(text="Response", token_count=50)

    events = conv.pull_events()
    assert len(events) == 1
    ev = events[0]
    assert isinstance(ev, TurnCompletedEvent)
    assert ev.total_tokens == 50
    assert ev.sme_id == "test-sme"
    assert ev.conversation_id == conv.id


def test_pull_events_clears_queue():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Hello")
    conv.add_assistant_turn(text="Hi", token_count=5)
    _ = conv.pull_events()
    assert conv.pull_events() == []


def test_messages_returns_copy():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Hello")
    msgs = conv.messages
    msgs.clear()
    assert len(conv.messages) == 1


def test_citations_stored_on_assistant_turn():
    conv = Conversation(sme_id="test-sme")
    conv.add_user_turn(text="Tell me about FTSE")
    citation = {"source_id": "ftse-http", "chunk_id": "1", "score": 0.9}
    msg = conv.add_assistant_turn(text="FTSE 100 is...", citations=[citation])
    assert msg.citations == [citation]


def test_conversation_id_is_unique():
    c1 = Conversation(sme_id="sme")
    c2 = Conversation(sme_id="sme")
    assert c1.id != c2.id


def test_explicit_id_is_preserved():
    conv = Conversation(id="fixed-id", sme_id="sme")
    assert conv.id == "fixed-id"
