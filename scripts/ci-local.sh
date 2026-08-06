#!/usr/bin/env bash
# The authoritative gate. CI runs this same script, so local and remote cannot drift.
#
# Two safety properties this script exists to guarantee, both of which were found
# the hard way during plan 091's review:
#
#   1. It never bills API calls. tests/llm/*.test.ts hit real provider endpoints and
#      are gated only by the presence of an API key — and bun AUTO-LOADS .env, which
#      carries real keys. `unset ANTHROPIC_API_KEY` does not work; the key is re-read
#      from .env. Only --env-file=/dev/null actually suppresses them.
#
#   2. It never touches a real database or a foreign service. Migrations read
#      DATABASE_URL with no test-only path, and Playwright's baseURL defaults to a
#      port that hosts an unrelated service on the primary dev machine while its seed
#      fixture creates classes and enrolls users. Both fail closed here.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FAST=0
[[ "${1:-}" == "--fast" ]] && FAST=1

FAILED=()
step() {
  local name="$1"; shift
  echo ""
  echo "══ $name"
  if "$@"; then
    echo "── $name OK"
  else
    echo "── $name FAILED" >&2
    FAILED+=("$name")
  fi
}

# ── Safety preconditions ─────────────────────────────────────────────────────

# Refuse to run against a non-test database. See AGENTS.md hard safeguards.
if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ ! "$DATABASE_URL" =~ _test(\?|$) && ! "$DATABASE_URL" =~ @(localhost|127\.0\.0\.1|postgres):[0-9]+/bridge_test ]]; then
    echo "REFUSING TO RUN: DATABASE_URL does not look like a test database." >&2
    echo "  got: ${DATABASE_URL%%\?*}" >&2
    echo "  Migrations read DATABASE_URL and Bridge has no down-migrations." >&2
    echo "  Point it at a *_test database, or unset it if this run needs no DB." >&2
    exit 2
  fi
fi

echo "Bridge local gate — repo $REPO_ROOT"
[[ $FAST -eq 1 ]] && echo "MODE: --fast (E2E skipped; NOT accepted by pre-merge-guard.sh)"

# ── Static ───────────────────────────────────────────────────────────────────

# Lint runs as a RATCHET, not a pass/fail on the raw count: main carries ~145
# pre-existing violations across ~83 files. The ratchet fails on anything new and
# tolerates what is recorded, so the gate is meaningful today instead of red until
# plan 093 finishes the cleanup. See scripts/check-lint-baseline.sh.
step "lint (ratchet)" bash scripts/check-lint-baseline.sh
step "type-check"     bunx tsc --noEmit

# ── Guards ───────────────────────────────────────────────────────────────────

step "guard: plans"      bash scripts/check-plan-uniqueness.sh
step "guard: specs"      bash scripts/check-spec-uniqueness.sh
step "guard: migrations" bash scripts/check-migration-uniqueness.sh
step "guard: decisions"  bash scripts/check-decisions-uniqueness.sh
step "guard: conflicts"  bash scripts/check-conflict-markers.sh
step "guard: self-test"  bash scripts/tests/test-guards.sh

# ── Tests ────────────────────────────────────────────────────────────────────

# Two independent hazards, two explicit overrides. Do NOT simplify this to
# `bun run test`, and do not drop either half.
#
#   DATABASE_URL — .env points at the DEVELOPMENT database, bun auto-loads .env,
#     and tests/helpers.ts truncates every table in afterEach. Pinning it to the
#     test DB is what keeps the suite off real data. (tests/helpers.ts now also
#     refuses a non-_test database outright, so this is belt and braces.)
#
#   *_API_KEY — tests/llm/*.test.ts call live provider endpoints, gated only by
#     `skipIf(!key)`. Exporting them EMPTY makes skipIf fire; `unset` does not
#     work, because bun re-reads the real values from .env.
step "vitest" env \
  DATABASE_URL="${TEST_DATABASE_URL:-postgresql://work@127.0.0.1:5432/bridge_test}" \
  ANTHROPIC_API_KEY= \
  OPENAI_API_KEY= \
  GEMINI_API_KEY= \
  DASHSCOPE_API_KEY= \
  OPENROUTER_API_KEY= \
  bun run test

step "go test" bash -c 'cd platform && go test ./... -count=1 -timeout 120s'

# ── E2E ──────────────────────────────────────────────────────────────────────

if [[ $FAST -eq 1 ]]; then
  echo ""
  echo "══ e2e SKIPPED (--fast)"
elif [[ -z "${E2E_BASE_URL:-}" ]]; then
  echo ""
  echo "REFUSING TO RUN E2E: E2E_BASE_URL is unset." >&2
  echo "  playwright.config.ts would fall back to http://localhost:3003, which on this" >&2
  echo "  machine is an unrelated service — and e2e/seed.setup.ts CREATES CLASSES and" >&2
  echo "  ENROLLS USERS against whatever answers." >&2
  echo "  Export E2E_BASE_URL pointing at your own stack, or use --fast." >&2
  FAILED+=("e2e (E2E_BASE_URL unset)")
else
  step "e2e" bun run test:e2e
fi

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if (( ${#FAILED[@]} )); then
  echo "GATE FAILED — ${#FAILED[@]} step(s):" >&2
  printf '  ✗ %s\n' "${FAILED[@]}" >&2
  exit 1
fi

echo "GATE PASSED"
[[ $FAST -eq 1 ]] && echo "NOTE: --fast run. Not sufficient for merge."
exit 0
