#!/usr/bin/env bash
# PreToolUse hook (matcher: Edit|Write). Enforces CLAUDE.md §3/§13 — "never
# hand-edit generated files; edit the domain and regenerate" — mechanically.
# Belt-and-suspenders alongside permissions.deny: deny rules have reported cases
# of not being consistently honored, so this hook is the real backstop.
set -euo pipefail

FILE_PATH="$(jq -r '.tool_input.file_path // empty')"
[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  */packages/contracts/generated/*|packages/contracts/generated/*)
    echo "Blocked: $FILE_PATH is under packages/contracts/generated/ — generated files are never hand-edited (CLAUDE.md §3). Edit packages/domain or the API and run /regen-contracts instead." >&2
    exit 2
    ;;
esac

exit 0
