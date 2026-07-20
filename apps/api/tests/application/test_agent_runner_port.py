"""Tests for the AgentEvent dataclasses' as_dict() serialisation
(application/ports/agent_runner_port.py). The ABCs themselves (AgentRunnerPort,
ToolExecutorPort) are pure interfaces with no logic to test — covered by
adapter contract tests instead (infrastructure/agent/*)."""
from application.ports.agent_runner_port import (
    AgentCompleteEvent,
    AgentErrorEvent,
    TextDeltaEvent,
    ToolPermissionEvent,
    ToolResultEvent,
)


def test_text_delta_event_as_dict():
    ev = TextDeltaEvent(text="Hello")
    assert ev.as_dict() == {"type": "text_delta", "text": "Hello"}


def test_tool_permission_event_as_dict():
    ev = ToolPermissionEvent(
        request_id="req-1", tool="bash", display="ls -la", input={"command": "ls -la"}
    )
    assert ev.as_dict() == {
        "type": "tool_permission",
        "request_id": "req-1",
        "tool": "bash",
        "display": "ls -la",
        "input": {"command": "ls -la"},
    }


def test_tool_result_event_as_dict():
    ev = ToolResultEvent(request_id="req-1", tool="bash", preview="output", denied=False)
    assert ev.as_dict() == {
        "type": "tool_result",
        "request_id": "req-1",
        "tool": "bash",
        "preview": "output",
        "denied": False,
    }


def test_tool_result_event_denied():
    ev = ToolResultEvent(request_id="req-2", tool="write_file", denied=True)
    assert ev.as_dict()["denied"] is True


def test_agent_complete_event_as_dict():
    ev = AgentCompleteEvent(total_tokens=123)
    assert ev.as_dict() == {"type": "complete", "total_tokens": 123}


def test_agent_error_event_as_dict():
    ev = AgentErrorEvent(message="Something failed")
    assert ev.as_dict() == {"type": "error", "message": "Something failed"}
