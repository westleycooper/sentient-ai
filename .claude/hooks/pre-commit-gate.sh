#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Fires on every Bash call but only acts when the
# command is a `git commit` — including autoCommit, since that also shells out to
# `git commit`. The real checks live in commit-gate.sh (shared with .githooks/pre-commit
# so manual/IDE commits are gated the same way, since Claude Code hooks only fire on
# Claude's own tool calls).
#
# Exit 0 = allow the commit. Exit 2 = block; stderr goes back to Claude as feedback.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

# Only gate actual commit invocations; every other Bash call passes straight through.
printf '%s' "$COMMAND" | grep -Eq '(^|[;&|]|\s)git\s+commit(\s|$)' || exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO_ROOT" ] && exit 0

"$REPO_ROOT/.claude/hooks/commit-gate.sh" || exit 2
exit 0
