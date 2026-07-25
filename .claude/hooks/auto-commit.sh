#!/usr/bin/env bash
# Stop hook: auto-commit the working tree after each completed Claude turn.
#
# This is what the old (inert) `"autoCommit": true` settings key was assumed to
# do — that key is not a Claude Code feature; this hook is the real mechanism.
#
# Safety properties:
#   - The commit goes through the repo's real pre-commit gate (.githooks/pre-commit
#     via core.hooksPath), so CLAUDE.md §12's checks (lint, typecheck, tests,
#     coverage, secret scan, no hand-edited generated files) still gate every
#     auto-commit. A failing gate SKIPS the commit; it never bypasses with
#     --no-verify.
#   - Never commits on main/master, during a merge/rebase, or when the tree is
#     clean. Excludes the .claude/worktrees gitlink (agent worktrees).
#   - Always exits 0 — a failed auto-commit reports via systemMessage but never
#     blocks Claude from stopping.
#
# Result is echoed as hook JSON (systemMessage) and appended to
# .claude/auto-commit.log for a durable record.
set -uo pipefail

emit() { # emit <message>  -> hook JSON + log line, then exit 0
  printf '%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG" 2>/dev/null || true
  jq -cn --arg m "auto-commit: $1" '{systemMessage: $m}'
  exit 0
}

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT"
LOG="$REPO_ROOT/.claude/auto-commit.log"

BRANCH="$(git branch --show-current)"
case "$BRANCH" in
  main|master|"") emit "skipped — on '$BRANCH' (never auto-commits the default branch)" ;;
esac

GIT_DIR="$(git rev-parse --git-dir)"
if [ -e "$GIT_DIR/MERGE_HEAD" ] || [ -e "$GIT_DIR/rebase-merge" ] || [ -e "$GIT_DIR/rebase-apply" ]; then
  emit "skipped — merge/rebase in progress"
fi

# Stage everything except the agent-worktree gitlink; bail if nothing staged.
git add -A -- . ':(exclude).claude/worktrees' 2>/dev/null
if git diff --cached --quiet; then
  exit 0 # clean tree — silent no-op (Stop fires on clear/resume/compact too)
fi

N_FILES="$(git diff --cached --name-only | wc -l | tr -d ' ')"
SUMMARY="$(git diff --cached --name-only | head -3 | xargs -n1 basename 2>/dev/null | paste -sd ', ' -)"
[ "$N_FILES" -gt 3 ] && SUMMARY="$SUMMARY, +$((N_FILES - 3)) more"

# Commit through the real gate (.githooks/pre-commit). Capture output so a
# gate failure can be reported back to the user.
GATE_OUT="$(git commit -m "chore(auto): checkpoint — $SUMMARY

Auto-committed by the Stop hook after a completed Claude Code turn.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" 2>&1)"
STATUS=$?

if [ $STATUS -eq 0 ]; then
  emit "committed $(git rev-parse --short HEAD) on $BRANCH ($N_FILES files: $SUMMARY)"
else
  # Unstage so the next turn's work isn't tangled with a half-staged tree.
  git reset -q HEAD -- . 2>/dev/null
  GATE_TAIL="$(printf '%s' "$GATE_OUT" | grep -E '^  - |Commit gate blocked' | head -5 | tr '\n' ' ')"
  emit "BLOCKED by commit gate on $BRANCH — changes left uncommitted. ${GATE_TAIL:-see .claude/auto-commit.log}"
fi
