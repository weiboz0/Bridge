#!/usr/bin/env bash
# Catch what a clean `git merge` hides.
#
# Two branches can merge without conflict and still be broken together: both claimed
# plan 091, both generated migration 0028, or one renamed a field the other's new
# test references. Text-level merging sees none of that.
#
#   pre-merge-guard.sh            → check the current working tree
#   pre-merge-guard.sh --pr <n>   → check the SIMULATED POST-MERGE state of PR <n>
#
# The --pr mode is the one that matters: it is the only mode that can see a collision
# between two branches, because the collision does not exist in either branch alone.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR="${2:-}"; shift 2 ;;
    -h|--help) echo "usage: pre-merge-guard.sh [--pr <number>]"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

run_checks() {
  local root="$1" rc=0
  echo "── numbering + hygiene guards"
  bash "$root/scripts/check-plan-uniqueness.sh"      || rc=1
  bash "$root/scripts/check-spec-uniqueness.sh"      || rc=1
  bash "$root/scripts/check-migration-uniqueness.sh" || rc=1
  bash "$root/scripts/check-decisions-uniqueness.sh" || rc=1
  bash "$root/scripts/check-conflict-markers.sh"     || rc=1

  # Semantic-break catcher. `go build` is NOT enough — it does not compile test
  # code, so a test referencing a renamed struct field passes the guard and fails
  # later at `go test`. `go vet` compiles tests too.
  echo "── semantic-break check"
  ( cd "$root/platform" && go vet ./... ) || rc=1
  ( cd "$root" && bunx tsc --noEmit )     || rc=1

  return $rc
}

if [[ -z "$PR" ]]; then
  echo "pre-merge-guard: working tree"
  run_checks "$REPO_ROOT"
  echo "pre-merge-guard: PASS"
  exit 0
fi

# ── Simulated post-merge state ───────────────────────────────────────────────

command -v gh >/dev/null || { echo "pre-merge-guard: --pr requires the gh CLI" >&2; exit 2; }

BASE="$(gh pr view "$PR" --json baseRefName --jq .baseRefName)"
HEAD="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"
echo "pre-merge-guard: simulating merge of PR #$PR ($HEAD) into $BASE"

WORKTREE="$(mktemp -d)"
# Cleanup on every exit path including interrupt — a stranded worktree makes every
# later `git worktree add` fail with a confusing error.
cleanup() {
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT INT TERM

git fetch --quiet origin "$BASE" || true
git worktree add --quiet --detach "$WORKTREE" "origin/$BASE" 2>/dev/null \
  || git worktree add --quiet --detach "$WORKTREE" "$BASE"

(
  cd "$WORKTREE"
  git fetch --quiet "$REPO_ROOT" "$HEAD" 2>/dev/null || git fetch --quiet origin "$HEAD" 2>/dev/null || true
  if ! git merge --no-commit --no-ff "$HEAD" >/dev/null 2>&1; then
    echo "[FAIL] PR #$PR does not merge cleanly into $BASE — resolve conflicts first." >&2
    git merge --abort >/dev/null 2>&1 || true
    exit 1
  fi
)

run_checks "$WORKTREE"
echo "pre-merge-guard: PASS (simulated post-merge state of PR #$PR)"
