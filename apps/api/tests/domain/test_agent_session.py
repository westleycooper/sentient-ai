"""Domain layer tests — AgentSession entity. ≥90% coverage required."""
from domain.agent_session import AgentMessage, AgentSession


def test_add_message_appends_to_history():
    session = AgentSession(session_id="s1", project_dir="/tmp/proj")
    session.add_message("user", "Hello")
    assert session.messages == [AgentMessage(role="user", content="Hello")]


def test_add_message_preserves_order():
    session = AgentSession(session_id="s1", project_dir="/tmp/proj")
    session.add_message("user", "First")
    session.add_message("assistant", [{"type": "text", "text": "Second"}])
    assert [m.role for m in session.messages] == ["user", "assistant"]


def test_tool_not_auto_allowed_by_default():
    session = AgentSession(session_id="s1", project_dir="/tmp/proj")
    assert session.is_auto_allowed("bash") is False


def test_allow_tool_always_marks_it_auto_allowed():
    session = AgentSession(session_id="s1", project_dir="/tmp/proj")
    session.allow_tool_always("bash")
    assert session.is_auto_allowed("bash") is True
    assert session.is_auto_allowed("write_file") is False


def test_allow_tool_always_is_idempotent():
    session = AgentSession(session_id="s1", project_dir="/tmp/proj")
    session.allow_tool_always("bash")
    session.allow_tool_always("bash")
    assert session.is_auto_allowed("bash") is True
