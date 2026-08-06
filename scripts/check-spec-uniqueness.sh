#!/usr/bin/env bash
# docs/specs/ has its OWN numbering namespace. It legitimately shares prefixes
# with docs/plans/ (001-010, 012 today) — never cross-check the two.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/uniqueness.sh
source "$REPO_ROOT/scripts/lib/uniqueness.sh"

ARGS=(specs "$REPO_ROOT/docs/specs" '*.md' 's/^([0-9]{3}[a-z]?).*\.md$/\1/p')
[[ "${1:-}" == "--selftest" ]] && { selftest_uniqueness "${ARGS[@]}"; exit $?; }
check_uniqueness "${ARGS[@]}"
