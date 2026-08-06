#!/usr/bin/env bash
# Fail when a tracked file carries unresolved merge-conflict markers.
#
# A botched conflict resolution can leave markers inside a string literal or a
# markdown block where nothing fails to compile — the file is simply wrong, and
# it merges cleanly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Anchored to line start, which is where git writes them. `<<<<<<< ` with the
# trailing space avoids matching heredocs and shell redirection.
PATTERN='^(<{7} |={7}$|>{7} )'

# Exclude this script and its test, which necessarily contain the pattern.
matches="$(git grep -nIE "$PATTERN" -- \
  ':!scripts/check-conflict-markers.sh' \
  ':!scripts/tests/test-guards.sh' || true)"

if [[ -n "$matches" ]]; then
  echo "[FAIL] unresolved conflict markers in tracked files:" >&2
  printf '%s\n' "$matches" | sed 's/^/  /' >&2
  exit 1
fi

exit 0
