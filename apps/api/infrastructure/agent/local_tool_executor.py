"""LocalToolExecutor — runs bash, file r/w, edit, and ls in the project directory.

Supports two working modes (from AgentConfig):
  full           — all paths within the project root are writable
  frontend_only  — writes restricted to apps/web/src/**; bash limited to safe cmds

All paths are validated against the project root to prevent traversal.
No PII is logged; command text is truncated in structured logs (CLAUDE.md §9, §10).
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from application.ports.agent_runner_port import ToolExecutorPort
from domain.agent_config import FRONTEND_SAFE_CMDS

logger = logging.getLogger(__name__)

_MAX_OUTPUT = 4000
_FRONTEND_ROOT = "apps/web/src"
_FRONTEND_BLOCKED_MSG = (
    "Frontend-only mode: writes are restricted to {root}/**. "
    "Got: {path!r}. Switch to Full mode in Code Agent settings to edit this file."
)
_BASH_BLOCKED_MSG = (
    "Frontend-only mode: bash is restricted to {allowed}. "
    "Got: {cmd!r}. Switch to Full mode in Code Agent settings to run arbitrary commands."
)


class LocalToolExecutor(ToolExecutorPort):
    def __init__(self, project_dir: str) -> None:
        self._root = Path(project_dir).resolve()

    # ------------------------------------------------------------------
    # Port implementation — working_mode forwarded from AgentConfig
    # ------------------------------------------------------------------

    async def execute(
        self, tool_name: str, tool_input: dict[str, Any], working_mode: str = "full"
    ) -> str:
        try:
            match tool_name:
                case "bash":
                    return await self._bash(tool_input, working_mode)
                case "read_file":
                    return self._read_file(tool_input)
                case "write_file":
                    return self._write_file(tool_input, working_mode)
                case "edit_file":
                    return self._edit_file(tool_input, working_mode)
                case "list_directory":
                    return self._list_directory(tool_input)
                case _:
                    return f"Unknown tool: {tool_name}"
        except PermissionError as exc:
            logger.warning("agent_tool_path_denied tool=%s", tool_name)
            return f"Permission denied: {exc}"
        except Exception as exc:
            logger.warning("agent_tool_error tool=%s error=%s", tool_name, type(exc).__name__)
            return f"Error: {exc}"

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    async def _bash(self, inp: dict, working_mode: str) -> str:
        command: str = inp["command"]
        timeout: int = int(inp.get("timeout", 30))

        if working_mode == "frontend_only":
            cmd_name = os.path.basename(command.split()[0]) if command.strip() else ""
            if cmd_name not in FRONTEND_SAFE_CMDS:
                return _BASH_BLOCKED_MSG.format(
                    allowed=", ".join(sorted(FRONTEND_SAFE_CMDS)),
                    cmd=cmd_name,
                )

        logger.info("agent_bash", extra={"cmd_prefix": command[:120]})
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(self._root),
        )
        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return f"Command timed out after {timeout} s"

        output = stdout.decode(errors="replace")
        return output[:_MAX_OUTPUT] if len(output) > _MAX_OUTPUT else output

    def _read_file(self, inp: dict) -> str:
        path = self._safe(inp["path"])
        if not path.exists():
            return f"File not found: {inp['path']}"
        content = path.read_text(encoding="utf-8", errors="replace")
        logger.info("agent_read_file", extra={"path": inp["path"]})
        return content[:_MAX_OUTPUT] if len(content) > _MAX_OUTPUT else content

    def _write_file(self, inp: dict, working_mode: str) -> str:
        path = self._safe_write(inp["path"], working_mode)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(inp["content"], encoding="utf-8")
        logger.info("agent_write_file", extra={"path": inp["path"]})
        return f"Written {inp['path']} ({len(inp['content'])} chars)"

    def _edit_file(self, inp: dict, working_mode: str) -> str:
        path = self._safe_write(inp["path"], working_mode)
        if not path.exists():
            return f"File not found: {inp['path']}"
        old: str = inp["old_string"]
        new: str = inp["new_string"]
        content = path.read_text(encoding="utf-8", errors="replace")
        if old not in content:
            return f"String not found in {inp['path']}"
        path.write_text(content.replace(old, new, 1), encoding="utf-8")
        logger.info("agent_edit_file", extra={"path": inp["path"]})
        return f"Edited {inp['path']}"

    def _list_directory(self, inp: dict) -> str:
        rel = inp.get("path", ".")
        path = self._safe(rel)
        if not path.exists():
            return f"Directory not found: {rel}"
        entries = sorted(os.listdir(path))
        return "\n".join(entries) or "(empty)"

    # ------------------------------------------------------------------
    # Path guards
    # ------------------------------------------------------------------

    def _safe(self, relative: str) -> Path:
        full = (self._root / relative).resolve()
        if not str(full).startswith(str(self._root)):
            raise PermissionError(f"Path outside project root: {relative!r}")
        return full

    def _safe_write(self, relative: str, working_mode: str) -> Path:
        full = self._safe(relative)
        if working_mode == "frontend_only":
            frontend_root = (self._root / _FRONTEND_ROOT).resolve()
            if not str(full).startswith(str(frontend_root)):
                raise PermissionError(
                    _FRONTEND_BLOCKED_MSG.format(root=_FRONTEND_ROOT, path=relative)
                )
        return full
