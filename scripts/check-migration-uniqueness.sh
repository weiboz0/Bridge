#!/usr/bin/env bash
# Two branches generating a migration both grab the same NNNN. Drizzle applies by
# filename order, so a collision means one silently never runs.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/uniqueness.sh
source "$REPO_ROOT/scripts/lib/uniqueness.sh"

ARGS=(migrations "$REPO_ROOT/drizzle" '*.sql' 's/^([0-9]{4}).*\.sql$/\1/p')
[[ "${1:-}" == "--selftest" ]] && { selftest_uniqueness "${ARGS[@]}"; exit $?; }
check_uniqueness "${ARGS[@]}"
