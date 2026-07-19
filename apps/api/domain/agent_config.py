"""AgentConfig — domain entity for the voice coding agent's runtime configuration.

Single-instance config (one row in agent_config table).
Pure Python — no FastAPI, no SDK imports (CLAUDE.md §3).
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Supported models with display metadata (used by frontend selector)
AVAILABLE_MODELS: list[dict] = [
    {
        "id": "claude-fable-5",
        "label": "Fable 5",
        "description": "Agentic — purpose-built for long multi-step coding tasks",
    },
    {
        "id": "claude-sonnet-5",
        "label": "Sonnet 5",
        "description": "Balanced — fast and capable for most code changes",
    },
    {
        "id": "claude-opus-4-8",
        "label": "Opus 4.8",
        "description": "Complex — best reasoning for large refactors",
    },
    {
        "id": "claude-haiku-4-5-20251001",
        "label": "Haiku 4.5",
        "description": "Fast — quick fixes and simple lookups",
    },
]

DEFAULT_MODEL = "claude-sonnet-5"

DEFAULT_SYSTEM_PROMPT = """\
You are Sentinel, an AI coding assistant embedded in the Sentinel voice agent platform. \
You have direct access to the project source code and can read, edit, and run it.

Project root: {project_dir}

Guidelines:
- Keep responses concise — they will be read aloud via text-to-speech.
- After making code changes, briefly confirm what you changed.
- Use relative paths from the project root for all file operations.
- When asked to change something, read the relevant file first, then edit it.
- Narrate each step of multi-step work as you go so the user knows what is happening.\
"""

FRONTEND_ONLY_SUFFIX = """

Working mode: FRONTEND ONLY.
You may only write or edit files inside apps/web/src/. \
Vite HMR will pick up your changes instantly.
Do not attempt to modify backend files, config files, or files outside apps/web/src/.
Bash commands are restricted to: pnpm, npm, npx, tsc, eslint, prettier, node.\
"""

ALL_TOOLS: list[str] = ["bash", "read_file", "write_file", "edit_file", "list_directory"]

# Bash commands allowed in frontend_only mode
FRONTEND_SAFE_CMDS: frozenset[str] = frozenset(
    ["pnpm", "npm", "npx", "node", "tsc", "eslint", "prettier", "vite"]
)


@dataclass
class AgentConfig:
    model: str = DEFAULT_MODEL
    # "full" — all files; "frontend_only" — writes restricted to apps/web/src/**
    working_mode: str = "full"
    system_prompt: str = DEFAULT_SYSTEM_PROMPT
    # Tools that skip the approval card and execute automatically this session
    auto_allow_tools: list[str] = field(default_factory=list)
    # Behavioural guardrails — {id, description, enabled}
    rules: list[dict] = field(default_factory=list)
    # Retrieval sources — {id, name, kind, config}
    sources: list[dict] = field(default_factory=list)
    # Theme ID referencing THEMES registry in apps/web/src/themes/index.ts
    theme_id: str = "dark-teal"

    def is_tool_auto_allowed(self, tool_name: str) -> bool:
        return tool_name in self.auto_allow_tools

    def resolved_system_prompt(self, project_dir: str) -> str:
        base = self.system_prompt.format(project_dir=project_dir)
        if self.working_mode == "frontend_only":
            base = base + FRONTEND_ONLY_SUFFIX
        enabled_rules = [
            r["description"] for r in self.rules
            if r.get("enabled", True) and r.get("description", "").strip()
        ]
        if enabled_rules:
            base += "\n\nBehavioural constraints — enforce on every response:\n" + "\n".join(
                f"- {r}" for r in enabled_rules
            )
        return base
