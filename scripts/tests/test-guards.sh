#!/usr/bin/env bash
# Executable tests for the guard scripts.
#
# A guard that has never been observed FAILING on a real collision is not a guard —
# it is a script that exits 0. Each case below builds a throwaway fixture tree and
# asserts the checker's exit status in both directions.
#
# The letter-suffix case is the important one: Bridge uses 025b / 030a-e / 079b
# deliberately, and a naive bare-NNN check flags every one of them.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/scripts/lib/uniqueness.sh"

PASS=0; FAIL=0
FIXTURES="$(mktemp -d)"
trap 'rm -rf "$FIXTURES"' EXIT

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1" >&2; FAIL=$((FAIL+1)); }

# expect <expected-rc> <description> <command...>
expect() {
  local want="$1" desc="$2"; shift 2
  local got=0
  "$@" >/dev/null 2>&1 || got=$?
  if [[ "$got" == "$want" ]]; then ok "$desc"; else bad "$desc (expected rc=$want, got rc=$got)"; fi
}

PLAN_RE='s/^([0-9]{3}[a-z]?).*\.md$/\1/p'
MIGR_RE='s/^([0-9]{4}).*\.sql$/\1/p'

echo "guard tests"

# ── 1. clean tree passes ─────────────────────────────────────────────────────
d="$FIXTURES/clean"; mkdir -p "$d"
touch "$d/001-alpha.md" "$d/002-beta.md" "$d/003-gamma.md"
expect 0 "clean numbering passes" check_uniqueness t "$d" '*.md' "$PLAN_RE"

# ── 2. real collision fails ──────────────────────────────────────────────────
d="$FIXTURES/collide"; mkdir -p "$d"
touch "$d/001-alpha.md" "$d/001-also-alpha.md"
expect 1 "duplicate NNN fails" check_uniqueness t "$d" '*.md' "$PLAN_RE"

# ── 3. letter suffixes are DISTINCT, not collisions ──────────────────────────
# The regression this whole file exists to prevent.
d="$FIXTURES/letters"; mkdir -p "$d"
touch "$d/030-base.md" "$d/030a-sub.md" "$d/030b-sub.md" "$d/030c-sub.md"
expect 0 "030 vs 030a/b/c are distinct tokens" check_uniqueness t "$d" '*.md' "$PLAN_RE"

# ── 4. two different letter-suffixed sub-plans DO collide with each other ────
d="$FIXTURES/letters-dup"; mkdir -p "$d"
touch "$d/030a-one.md" "$d/030a-two.md"
expect 1 "030a twice is still a collision" check_uniqueness t "$d" '*.md' "$PLAN_RE"

# ── 5. baseline suppresses a known collision, but only that one ──────────────
d="$FIXTURES/baseline"; mkdir -p "$d"
touch "$d/012-one.md" "$d/012-two.md"
bl="$FIXTURES/baseline.txt"; printf '# comment\n\n012\n' > "$bl"
expect 0 "baselined collision is accepted" check_uniqueness t "$d" '*.md' "$PLAN_RE" "$bl"
touch "$d/049-one.md" "$d/049-two.md"
expect 1 "NEW collision still fails despite baseline" check_uniqueness t "$d" '*.md' "$PLAN_RE" "$bl"

# ── 6. migrations use 4 digits with no letter suffix ─────────────────────────
d="$FIXTURES/migr"; mkdir -p "$d"
touch "$d/0001_a.sql" "$d/0002_b.sql"
expect 0 "clean migrations pass" check_uniqueness t "$d" '*.sql' "$MIGR_RE"
touch "$d/0002_c.sql"
expect 1 "duplicate migration prefix fails" check_uniqueness t "$d" '*.sql' "$MIGR_RE"

# ── 7. missing directory is a skip, not a crash ──────────────────────────────
expect 0 "absent directory skips cleanly" check_uniqueness t "$FIXTURES/nope" '*.md' "$PLAN_RE"

# ── 8. conflict markers ──────────────────────────────────────────────────────
d="$FIXTURES/conflict"; mkdir -p "$d"
{ printf '<<<<<<< HEAD\n'; printf 'a\n'; printf '=======\n'; printf 'b\n'; printf '>>>>>>> other\n'; } > "$d/f.txt"
if grep -qE '^(<{7} |={7}$|>{7} )' "$d/f.txt"; then ok "conflict-marker pattern matches real markers"; else bad "conflict-marker pattern missed real markers"; fi
printf 'x <<<<<<< inline, not a marker\n' > "$d/g.txt"
if grep -qE '^(<{7} |={7}$|>{7} )' "$d/g.txt"; then bad "conflict-marker pattern false-positives mid-line"; else ok "conflict-marker pattern ignores mid-line text"; fi

# ── 9. the real repo's guards pass, and their selftests trip ─────────────────
expect 0 "live plan guard passes"      bash "$REPO_ROOT/scripts/check-plan-uniqueness.sh"
expect 0 "live spec guard passes"      bash "$REPO_ROOT/scripts/check-spec-uniqueness.sh"
expect 0 "live migration guard passes" bash "$REPO_ROOT/scripts/check-migration-uniqueness.sh"
expect 0 "live decisions guard passes" bash "$REPO_ROOT/scripts/check-decisions-uniqueness.sh"
expect 0 "plan guard selftest trips"      bash "$REPO_ROOT/scripts/check-plan-uniqueness.sh" --selftest
expect 0 "migration guard selftest trips" bash "$REPO_ROOT/scripts/check-migration-uniqueness.sh" --selftest

# ── 10. pre-merge-guard rejects bad arguments rather than proceeding ─────────
expect 2 "pre-merge-guard rejects unknown args" bash "$REPO_ROOT/scripts/pre-merge-guard.sh" --bogus

echo ""
echo "guard tests: $PASS passed, $FAIL failed"
(( FAIL == 0 ))
