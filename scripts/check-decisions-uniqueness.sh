#!/usr/bin/env bash
# Fail on duplicate section numbers in docs/architecture/decisions.md.
#
# Entries are cited across the codebase as "decisions.md §N", so a duplicated
# number silently makes every inbound citation ambiguous. Two parallel sessions
# each appending "the next free §" is the normal way this happens.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DECISIONS="$REPO_ROOT/docs/architecture/decisions.md"

if [[ ! -f "$DECISIONS" ]]; then
  echo "[SKIP] decisions: $DECISIONS does not exist" >&2
  exit 0
fi

# Match "## §12 — Title"
tokens="$(sed -nE 's/^##[[:space:]]+§([0-9]+)[[:space:]].*$/\1/p' "$DECISIONS" | sort -n)"
dupes="$(printf '%s\n' "$tokens" | uniq -d | grep -v '^$' || true)"

if [[ -n "$dupes" ]]; then
  echo "[FAIL] decisions: duplicate section number(s) in docs/architecture/decisions.md:" >&2
  while IFS= read -r n; do
    [[ -z "$n" ]] && continue
    echo "  §$n:" >&2
    grep -nE "^##[[:space:]]+§${n}[[:space:]]" "$DECISIONS" | sed 's/^/    /' >&2
  done <<< "$dupes"
  echo "Hint: renumber the newer entry. Numbers are never reused — citations depend on them." >&2
  exit 1
fi

if [[ "${1:-}" == "--selftest" ]]; then
  first="$(printf '%s\n' "$tokens" | head -n1)"
  if [[ -z "$first" ]]; then
    echo "SELFTEST SKIP (decisions): no entries to duplicate" >&2
    exit 0
  fi
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"; mv "$tmp.bak" "$DECISIONS" 2>/dev/null || true' EXIT
  cp "$DECISIONS" "$tmp.bak"
  printf '\n## §%s — selftest injected duplicate\n' "$first" >> "$DECISIONS"
  if "$0" >/dev/null 2>&1; then
    echo "SELFTEST FAIL (decisions): guard did not detect injected §$first duplicate" >&2
    exit 1
  fi
  echo "selftest PASS (decisions): guard caught injected §$first duplicate"
  exit 0
fi

exit 0
