#!/usr/bin/env bash
# Lint ratchet: fail on NEW lint violations, tolerate recorded pre-existing ones.
#
# main carries ~145 violations across ~83 files (76 of them no-explicit-any, each
# needing a real typing decision). Blocking on all of them would mean the gate is
# red until an 83-file cleanup lands; ignoring them means the count grows forever.
# So: record what exists, fail on anything new. Plan 093 shrinks the baseline.
#
# Same idea as scripts/plan-collision-baseline.txt, applied to lint.
#
#   check-lint-baseline.sh              → fail if violations exceed the baseline
#   check-lint-baseline.sh --update     → rewrite the baseline (use ONLY when reducing)
#   check-lint-baseline.sh --selftest   → prove the ratchet catches a new violation
#
# Keyed on "<file>::<rule>::<count>", not line numbers, so unrelated edits above a
# violation don't produce spurious diffs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BASELINE="$REPO_ROOT/scripts/lint-baseline.txt"

current_counts() {
  local raw tracked
  raw="$(mktemp)"; tracked="$(mktemp)"
  # eslint exits non-zero when it finds errors, which is the normal case here —
  # `|| true` keeps `set -o pipefail` from aborting before we can read the report.
  bunx eslint -f json 2>/dev/null > "$raw" || true
  # Tracked files PLUS untracked-but-not-ignored ones. The --others half is
  # load-bearing: a brand-new file is untracked at the moment it is linted, and
  # filtering on `git ls-files` alone would let an agent introduce any number of
  # violations in new code without the ratchet noticing. --exclude-standard still
  # drops gitignored build output like coverage/, which differs per machine.
  git ls-files --cached --others --exclude-standard > "$tracked"
  python3 -c '
import json, os, sys, collections
raw, tracked = sys.argv[1], sys.argv[2]
with open(raw) as fh:
    try:
        data = json.load(fh)
    except Exception:
        sys.exit("could not parse eslint JSON output")
keep = set(open(tracked).read().split())
counts = collections.Counter()
root = os.getcwd()
for f in data:
    rel = os.path.relpath(f["filePath"], root)
    if rel not in keep:
        continue
    for m in f.get("messages", []):
        counts[(rel, m.get("ruleId") or "(fatal)")] += 1
for (rel, rule), n in sorted(counts.items()):
    print(f"{rel}::{rule}::{n}")
' "$raw" "$tracked"
  rm -f "$raw" "$tracked"
}

if [[ "${1:-}" == "--update" ]]; then
  {
    echo "# Pre-existing lint violations, one '<file>::<rule>::<count>' per line."
    echo "#"
    echo "# The gate fails on anything NOT covered here, or on a count that grew."
    echo "# Only ever regenerate this to make it SMALLER. Adding a line to silence a"
    echo "# new violation defeats the ratchet — fix the violation instead."
    echo "#"
    echo "# Tracked for reduction by plan 093."
    echo ""
    current_counts
  } > "$BASELINE"
  echo "baseline updated: $(grep -cv '^\s*\(#\|$\)' "$BASELINE") entries"
  exit 0
fi

if [[ "${1:-}" == "--selftest" ]]; then
  probe="$REPO_ROOT/src/lint-ratchet-selftest.ts"
  trap 'rm -f "$probe"' EXIT
  # An unused variable with an explicit any — two recorded rules, new file.
  printf 'const selftestUnused: any = 1;\n' > "$probe"
  if "$0" >/dev/null 2>&1; then
    echo "SELFTEST FAIL (lint): ratchet did not catch a newly introduced violation" >&2
    exit 1
  fi
  echo "selftest PASS (lint): ratchet caught a newly introduced violation"
  exit 0
fi

if [[ ! -f "$BASELINE" ]]; then
  echo "[FAIL] lint: $BASELINE missing. Generate it with --update." >&2
  exit 1
fi

CUR="$(mktemp)"; BASE="$(mktemp)"
trap 'rm -f "$CUR" "$BASE"' EXIT

current_counts > "$CUR"
grep -vE '^[[:space:]]*(#|$)' "$BASELINE" | sort > "$BASE"

# A regression is any current line not present verbatim in the baseline. Because
# the count is part of the key, 3 violations where the baseline recorded 2 is a
# new line and therefore a failure.
NEW="$(comm -23 <(sort "$CUR") "$BASE" || true)"

if [[ -n "$NEW" ]]; then
  echo "[FAIL] lint: new violation(s) beyond the recorded baseline:" >&2
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    file="${line%%::*}"; rest="${line#*::}"
    rule="${rest%%::*}"; count="${rest##*::}"
    was="$(grep -F "${file}::${rule}::" "$BASE" | sed 's/.*:://' || true)"
    if [[ -n "$was" ]]; then
      echo "  $file — $rule: $was → $count" >&2
    else
      echo "  $file — $rule: $count (new)" >&2
    fi
  done <<< "$NEW"
  echo "" >&2
  echo "Fix the new violations. Do NOT run --update to absorb them." >&2
  exit 1
fi

exit 0
