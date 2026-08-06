#!/usr/bin/env bash
# Fail on a NEW docs/plans/ number collision. Tokens are NNN[a-z] — 030 and 030a
# are distinct, because Bridge uses letter-suffixed sub-plans on purpose.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/uniqueness.sh
source "$REPO_ROOT/scripts/lib/uniqueness.sh"

ARGS=(plans "$REPO_ROOT/docs/plans" '*.md' 's/^([0-9]{3}[a-z]?).*\.md$/\1/p' "$REPO_ROOT/scripts/plan-collision-baseline.txt")
[[ "${1:-}" == "--selftest" ]] && { selftest_uniqueness "${ARGS[@]}"; exit $?; }
check_uniqueness "${ARGS[@]}"
