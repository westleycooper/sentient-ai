#!/usr/bin/env bash
# Scans staged (added) lines for likely secret literals.
# Usage: secret-scan.sh   (reads `git diff --cached`, exits 1 if a match is found)
# CLAUDE.md §8/§9: secrets resolve from Key Vault at runtime; a literal secret in a
# commit is a blocking failure. This is a pattern-based net, not a substitute for
# real secret-scanning in CI (e.g. gitleaks) — it exists to catch the common cases
# before they ever leave the machine.
set -euo pipefail

# Files where placeholder-looking values are expected and shouldn't trip the scan.
EXCLUDE_PATHSPEC=(
  ':(exclude)*.example'
  ':(exclude)*.lock'
  ':(exclude)pnpm-lock.yaml'
  ':(exclude)uv.lock'
  ':(exclude)*.md'
  ':(exclude)docker-compose.yml'          # local-only dev creds, not real secrets
  ':(exclude).claude/settings*.json'      # non-secret local dev config only (CLAUDE.md §8)
)

DIFF="$(git diff --cached --unified=0 -- . "${EXCLUDE_PATHSPEC[@]}" 2>/dev/null || true)"
[ -z "$DIFF" ] && exit 0

ADDED_LINES="$(printf '%s\n' "$DIFF" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
[ -z "$ADDED_LINES" ] && exit 0

# Pattern set: vendor-specific token shapes + generic "key/secret/token = <long literal>" assignments.
PATTERNS=(
  'AKIA[0-9A-Z]{16}'                                   # AWS access key id
  'sk-[A-Za-z0-9]{20,}'                                 # OpenAI-style secret key
  'AIza[0-9A-Za-z_-]{35}'                               # Google API key
  'xox[baprs]-[0-9A-Za-z-]{10,}'                        # Slack token
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'                  # PEM private key
  '(secret|password|passwd|token|api[_-]?key)["\x27]?\s*[:=]\s*["\x27][A-Za-z0-9/+_=-]{12,}["\x27]'
  'postgres(ql)?://[^[:space:]]*:[^@[:space:]]{4,}@'    # DB connection string with embedded password
)

HITS=""
for pat in "${PATTERNS[@]}"; do
  m="$(printf '%s\n' "$ADDED_LINES" | grep -EinI -e "$pat" || true)"
  [ -n "$m" ] && HITS="${HITS}${m}"$'\n'
done

if [ -n "$HITS" ]; then
  echo "Potential secret literal(s) in staged changes (CLAUDE.md §8/§9 — no secrets in code/config):" >&2
  echo "$HITS" >&2
  echo "If this is a false positive, adjust .claude/hooks/secret-scan.sh's exclude list rather than committing anyway." >&2
  exit 1
fi

exit 0
