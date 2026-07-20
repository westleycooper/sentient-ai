#!/usr/bin/env bash
# Shared commit gate — the actual checks, with no dependency on how the commit was
# invoked. Called from two places:
#   - .claude/hooks/pre-commit-gate.sh   (Claude Code PreToolUse hook, incl. autoCommit)
#   - .githooks/pre-commit               (real git hook — catches manual/IDE commits too,
#                                          since Claude Code hooks only fire on Claude's
#                                          own tool calls)
# CLAUDE.md §12 Definition of Done: lint + typecheck + tests green, no hand-edits to
# generated/**, no secret literals — before anything lands in a commit.
#
# Exit 0 = clean. Exit 1 = blocked (git hook convention; callers translate as needed).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT"

FAILURES=()

STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACM)"

if printf '%s\n' "$STAGED_FILES" | grep -q '^packages/contracts/generated/'; then
  FAILURES+=("packages/contracts/generated/** is generated — edit packages/domain or the API and run /regen-contracts instead of hand-editing (CLAUDE.md §3, §13).")
fi

if ! .claude/hooks/secret-scan.sh; then
  FAILURES+=("Secret-literal scan failed (see above) — CLAUDE.md §8/§9: no secrets in code/config.")
fi

API_PY_FILES="$(printf '%s\n' "$STAGED_FILES" | grep '^apps/api/.*\.py$' || true)"
if [ -n "$API_PY_FILES" ]; then
  echo "-- apps/api changed: running ruff (staged files only) + full pytest --" >&2
  # Scoped to staged files, not the whole tree: DoD (CLAUDE.md §12) requires "zero
  # NEW violations" on lint, not a clean bill on pre-existing repo-wide lint debt.
  RELATIVE_FILES="$(printf '%s\n' "$API_PY_FILES" | sed 's#^apps/api/##')"
  if ! (cd apps/api && printf '%s\n' "$RELATIVE_FILES" | xargs uv run ruff check); then
    FAILURES+=("apps/api: ruff check failed on staged files.")
  fi
  # --cov enforces pyproject.toml's fail_under=90 on domain+application
  # (CLAUDE.md §11). Repo-wide, not staged-scoped: coverage is cumulative,
  # so "only check what changed" doesn't make sense the way it does for lint.
  if ! (cd apps/api && uv run pytest --cov); then
    FAILURES+=("apps/api: pytest failed, or domain+application coverage dropped below 90% (CLAUDE.md §11).")
  fi
fi

if printf '%s\n' "$STAGED_FILES" | grep -qE '^apps/web/.*\.(ts|tsx|js|jsx)$'; then
  echo "-- apps/web changed: running eslint + tsc + vitest --" >&2
  # Not running `pnpm test:coverage` here (unlike apps/api's --cov above):
  # most of the pre-existing frontend is untested, so enforcing the 80%
  # threshold (CLAUDE.md §11) would block on debt, not regressions. Revisit
  # once that debt is paid down.
  if ! (cd apps/web && pnpm lint); then
    FAILURES+=("apps/web: eslint failed.")
  fi
  if ! (cd apps/web && pnpm typecheck); then
    FAILURES+=("apps/web: tsc --noEmit failed.")
  fi
  if ! (cd apps/web && pnpm test); then
    FAILURES+=("apps/web: vitest failed.")
  fi
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "Commit gate blocked this commit:" >&2
  for f in "${FAILURES[@]}"; do
    echo "  - $f" >&2
  done
  exit 1
fi

exit 0
