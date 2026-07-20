"""Domain layer tests — AgentConfig entity. ≥90% coverage required."""
from domain.agent_config import DEFAULT_MODEL, AgentConfig


def test_defaults():
    config = AgentConfig()
    assert config.model == DEFAULT_MODEL
    assert config.working_mode == "full"
    assert config.auto_allow_tools == []


def test_is_tool_auto_allowed():
    config = AgentConfig(auto_allow_tools=["bash", "read_file"])
    assert config.is_tool_auto_allowed("bash") is True
    assert config.is_tool_auto_allowed("write_file") is False


def test_resolved_system_prompt_substitutes_project_dir():
    config = AgentConfig(system_prompt="Root: {project_dir}")
    assert config.resolved_system_prompt("/home/project") == "Root: /home/project"


def test_resolved_system_prompt_full_mode_has_no_frontend_suffix():
    config = AgentConfig(system_prompt="Base")
    resolved = config.resolved_system_prompt("/proj")
    assert "FRONTEND ONLY" not in resolved


def test_resolved_system_prompt_frontend_only_mode_appends_suffix():
    config = AgentConfig(system_prompt="Base", working_mode="frontend_only")
    resolved = config.resolved_system_prompt("/proj")
    assert "FRONTEND ONLY" in resolved
    assert resolved.startswith("Base")


def test_resolved_system_prompt_includes_enabled_rules():
    config = AgentConfig(
        system_prompt="Base",
        rules=[
            {"id": "r1", "description": "Always write tests", "enabled": True},
            {"id": "r2", "description": "Never touch main.py", "enabled": True},
        ],
    )
    resolved = config.resolved_system_prompt("/proj")
    assert "Always write tests" in resolved
    assert "Never touch main.py" in resolved
    assert "Behavioural constraints" in resolved


def test_resolved_system_prompt_excludes_disabled_rules():
    config = AgentConfig(
        system_prompt="Base",
        rules=[{"id": "r1", "description": "Disabled rule", "enabled": False}],
    )
    resolved = config.resolved_system_prompt("/proj")
    assert "Disabled rule" not in resolved
    assert "Behavioural constraints" not in resolved


def test_resolved_system_prompt_excludes_blank_description_rules():
    config = AgentConfig(
        system_prompt="Base",
        rules=[{"id": "r1", "description": "   ", "enabled": True}],
    )
    resolved = config.resolved_system_prompt("/proj")
    assert "Behavioural constraints" not in resolved


def test_resolved_system_prompt_no_rules_key_defaults_enabled():
    config = AgentConfig(
        system_prompt="Base",
        rules=[{"id": "r1", "description": "No enabled key set"}],
    )
    resolved = config.resolved_system_prompt("/proj")
    assert "No enabled key set" in resolved
