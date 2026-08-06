#!/usr/bin/env bash
# Shared numbering-collision checker.
#
# Parallel agent sessions each pick "the next free number" from their own branch,
# so two branches routinely claim the same one. Nothing surfaces that until the
# second merge, by which point both artifacts are written. This catches it first.
#
# Tokenization is the load-bearing detail: a token is NNN plus an OPTIONAL letter,
# so 030 and 030a are DISTINCT. Bridge deliberately uses letter-suffixed sub-plans
# (025b, 030a-e, 033a/b, 053b, 079b) and a bare-NNN check would flag every one of
# them as a collision.

set -euo pipefail

# check_uniqueness <label> <dir> <file-glob> <token-sed-regex> [baseline-file]
check_uniqueness() {
  local label="$1" dir="$2" glob="$3" regex="$4" baseline="${5:-}"

  if [[ ! -d "$dir" ]]; then
    echo "[SKIP] $label: $dir does not exist" >&2
    return 0
  fi

  local tokens collisions new
  tokens="$(find "$dir" -maxdepth 1 -type f -name "$glob" -printf '%f\n' 2>/dev/null \
    | sed -nE "$regex" | sort)"

  collisions="$(printf '%s\n' "$tokens" | uniq -d | grep -v '^$' || true)"

  if [[ -n "$baseline" && -f "$baseline" ]]; then
    # Accepted pre-existing collisions. Never add a line here to silence a NEW
    # collision — renumber the newer artifact instead.
    new="$(comm -23 \
      <(printf '%s\n' "$collisions" | sort -u | grep -v '^$' || true) \
      <(grep -vE '^[[:space:]]*(#|$)' "$baseline" | tr -d '[:blank:]' | sort -u) || true)"
  else
    new="$collisions"
  fi

  if [[ -n "$new" ]]; then
    echo "[FAIL] $label: number collision(s) in $dir:" >&2
    while IFS= read -r tok; do
      [[ -z "$tok" ]] && continue
      echo "  $tok:" >&2
      find "$dir" -maxdepth 1 -type f -name "${tok}*" -printf '    %f\n' 2>/dev/null | sort >&2
    done <<< "$new"
    echo "Hint: renumber the NEWER artifact to the next free number. Do not edit the baseline." >&2
    return 1
  fi

  return 0
}

# selftest_uniqueness — inject a duplicate of an existing artifact, assert the
# checker fails, then clean up. A guard never observed failing is not a guard.
selftest_uniqueness() {
  local label="$1" dir="$2" glob="$3" regex="$4" baseline="${5:-}"
  local token stub rc

  token="$(find "$dir" -maxdepth 1 -type f -name "$glob" -printf '%f\n' 2>/dev/null \
    | sed -nE "$regex" | sort -V | tail -n1)"

  if [[ -z "$token" ]]; then
    echo "SELFTEST SKIP ($label): no existing artifact to duplicate" >&2
    return 0
  fi

  local ext="${glob##*.}"
  stub="$dir/${token}-SELFTEST-injected-collision.$ext"
  # shellcheck disable=SC2064
  trap "rm -f '$stub'" RETURN
  printf '# selftest\n' > "$stub"

  rc=0
  check_uniqueness "$label" "$dir" "$glob" "$regex" "$baseline" >/dev/null 2>&1 || rc=$?

  if (( rc == 0 )); then
    echo "SELFTEST FAIL ($label): guard did not detect injected $token collision" >&2
    return 1
  fi

  echo "selftest PASS ($label): guard caught injected $token collision"
  return 0
}
