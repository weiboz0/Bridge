---
name: br-test-coverage
description: Use when the user asks "what tests should I run for this change?", "what's missing test coverage?", "did I add enough tests for plan-NNN?", "test gap audit before push". Scans a git diff range, cross-references changed source files with their test files, identifies missing/partial coverage per CLAUDE.md rules (every Go endpoint MUST have an integration test; happy-path + auth + error + cross-user isolation per public function), and produces both a gap report AND a targeted test plan (minimal commands to verify the actual changed code). Optional auto_run executes the plan.
---

# br-test-coverage

Pre-push test-gap audit + smart-scoped test runner. Designed to catch missing-test situations **before** the commit/push, when fixing them is cheap.

## When to invoke

- Before pushing a feature branch: "any test gaps?" / "what should I run?"
- After implementing a phase but before the code-review gate: confirm CLAUDE.md test rules are met.
- When unsure which test subset to run on a small change (instead of always running the full suite).
- When you want auto-execution of just the minimal command set (`auto_run=true`).

## When NOT to invoke

- "Run all tests" → run `bun run test` + `cd platform && go test ./... -count=1 -timeout 120s` explicitly.
- Single-fingerprint failure analysis → `investigate-errors`.

## Inputs

All optional. Args parsed `key=value` from the slash-command tail.

| Arg | Default | Meaning |
|---|---|---|
| `range` | auto-detect (see below) | Git diff range, e.g. `main..HEAD`, `HEAD~3..HEAD`, `working-tree`. |
| `paths` | _(none)_ | Comma-sep path prefix filter, e.g. `platform/internal/handlers,src/components/session`. |
| `auto_run` | `false` | If `true`, execute the test plan after the report. Stops on first failure. |
| `include_passing` | `true` | Show `[OK]` rows for files that have matching tests. Set `false` for problems-only. |
| `skip` | _(none)_ | Comma-sep audit-category filter — `go-handlers`, `go-store`, `go-internal`, `ts-components`, `ts-hooks`, `ts-api-clients`. |
| `generate_missing` | `false` | After the report, offer (one question) to dispatch subagents (Codex for Go, Sonnet for TS) to write the missing tests. |

### range auto-detection

1. If user passed `range=...` — use it.
2. Else, if current branch ≠ `main` AND has commits ahead of `main` → `range=main..HEAD`.
3. Else, if current branch = `main` AND has commits ahead of `origin/main` → `range=origin/main..HEAD`.
4. Else, if working tree dirty (uncommitted changes) → `range=working-tree` (use `git diff` for content, `git ls-files --modified --others --exclude-standard` for the file set).
5. Else → ask the user for a range. Don't audit `main..main`.

## CLAUDE.md rules being audited

| Tag | Rule | Detection |
|---|---|---|
| `[GAP]` | Every new Go API endpoint MUST have an integration test | Diff adds `r.(Get\|Post\|Patch\|Put\|Delete)\(` in `platform/internal/handlers/*.go` → look for matching integration test referencing that route or handler function. |
| `[PARTIAL]` | "Test happy path, auth check, error cases, cross-user isolation" | For each new endpoint, check that the integration test file covers ALL FOUR. Missing 1+ → `[PARTIAL]`. |
| `[GAP]` | Every public function should have a test | Diff adds `^func (\([^)]+\) )?[A-Z]\w+` in any `platform/...go` (not `_test.go`) → look for matching test name in same package's `*_test.go`. |
| `[GAP]` | Frontend components need vitest tests | Diff adds a new `export (default )?function [A-Z]` in `src/components/**/*.tsx` (not `*.test.*`) → look for `src/components/**/__tests__/<Name>.test.tsx` or `<Name>.test.tsx` co-located. |
| `[GAP]` | Hooks + API clients need tests | Diff adds new exported function in `src/hooks/*.ts` or `src/lib/*.ts` → look for corresponding test in `tests/unit/` or co-located `*.test.ts`. |
| `[GAP]` | Store functions need tests | Diff adds public function in `platform/internal/store/*.go` (not `_test.go`) → corresponding `*_test.go` in same directory should cover it. |
| `[GAP]` | New error path needs test | Diff adds `return ..., fmt.Errorf\|errors.New\|writeError\|writeFieldError` → corresponding test should assert the error case. (Heuristic only — best-effort.) |
| `[GAP]` | New SQL migration needs verification | Diff adds `drizzle/*.sql` → there should be a test (unit or integration) that exercises the new schema. |

Each gap also has a positive form (`[OK]`) when the test exists.

## Workflow

### Step 0 — Resolve range + enumerate changed files

```bash
# Step 0.1 — pick range
if [[ -n "$range" ]]; then
  RANGE="$range"
elif [[ "$(git symbolic-ref --short HEAD)" != "main" ]] && [[ -n "$(git log main..HEAD --oneline 2>/dev/null)" ]]; then
  RANGE="main..HEAD"
elif [[ -n "$(git log origin/main..HEAD --oneline 2>/dev/null)" ]]; then
  RANGE="origin/main..HEAD"
elif [[ -n "$(git status --porcelain)" ]]; then
  RANGE="working-tree"
else
  echo "No diff to audit — pass range=..." && exit 0
fi

# Step 0.2 — enumerate files
if [[ "$RANGE" == "working-tree" ]]; then
  FILES=$(git ls-files --modified --others --exclude-standard)
else
  FILES=$(git diff --name-only "$RANGE")
fi

# Step 0.3 — filter by paths if provided
if [[ -n "$paths" ]]; then
  # paths is comma-sep; build a regex like '^(platform/internal/handlers|src/components/session)'
  FILTER=$(echo "$paths" | tr ',' '|')
  FILES=$(echo "$FILES" | grep -E "^($FILTER)")
fi

# Step 0.4 — partition by category
GO_HANDLERS=$(echo "$FILES" | grep -E '^platform/internal/handlers/.*\.go$' | grep -v '_test\.go$')
GO_STORE=$(echo "$FILES" | grep -E '^platform/internal/store/.*\.go$' | grep -v '_test\.go$')
GO_INTERNAL=$(echo "$FILES" | grep -E '^platform/internal/' | grep '\.go$' | grep -v '_test\.go$' | grep -vE '^platform/internal/(handlers|store)/')
GO_TESTS=$(echo "$FILES" | grep -E '\.go$' | grep '_test\.go$')
SQL_MIGRATIONS=$(echo "$FILES" | grep -E '^drizzle/.*\.sql$')
TS_COMPONENTS=$(echo "$FILES" | grep -E '^src/components/.*\.tsx?$' | grep -v '\.test\.')
TS_HOOKS=$(echo "$FILES" | grep -E '^src/hooks/.*\.ts$' | grep -v '\.test\.')
TS_API_CLIENTS=$(echo "$FILES" | grep -E '^src/lib/.*\.ts$' | grep -v '\.test\.')
TS_TESTS=$(echo "$FILES" | grep -E '\.test\.(ts|tsx)$|__tests__/')
```

### Step 1 — Audit Go handlers

For each file in `$GO_HANDLERS`:

```bash
# Extract NEW routes added in the diff (lines starting with '+')
NEW_ROUTES=$(git diff "$RANGE" -- "$file" | grep -E '^\+\s*r\.(Get|Post|Patch|Put|Delete)\(' || true)

for route in $NEW_ROUTES; do
  # Extract the path string (between first " and second ")
  ROUTE_PATH=$(echo "$route" | grep -oP '"[^"]+"' | head -1 | tr -d '"')
  # Extract the handler function ref (e.g., h.CreateSession)
  HANDLER_FN=$(echo "$route" | grep -oP '[a-z]\.[A-Z]\w+' | tail -1)

  # Search integration tests for either the route path or the handler function name
  # Bridge integration tests live co-located in platform/internal/handlers/ (*_integration_test.go)
  # and in tests/integration/ (TypeScript Vitest integration tests)
  TEST_HITS=$(grep -rlE "${ROUTE_PATH}|${HANDLER_FN##*.}" platform/internal/handlers/ 2>/dev/null | grep '_test\.go$')

  if [[ -z "$TEST_HITS" ]]; then
    emit "[GAP] handlers/${file##*/}: $ROUTE_PATH (handler $HANDLER_FN) has no integration test"
    suggest_tests "$HANDLER_FN"  # happy-path + auth + error + cross-user names
  else
    # PARTIAL check: does the test file cover all four CLAUDE.md categories?
    HAS_AUTH=$(grep -lE "Unauthorized|AuthRequired|StatusUnauthorized|401" $TEST_HITS)
    HAS_ERROR=$(grep -lE "StatusBadRequest|StatusInternalServerError|400|500" $TEST_HITS)
    HAS_CROSS_USER=$(grep -lE "Outsider|NonMember|cross.org|cross.user|403|404" $TEST_HITS)
    # happy-path is implied by the test existing at all

    missing=()
    [[ -z "$HAS_AUTH" ]] && missing+=("auth-check")
    [[ -z "$HAS_ERROR" ]] && missing+=("error-cases")
    [[ -z "$HAS_CROSS_USER" ]] && missing+=("cross-user-isolation")

    if [[ ${#missing[@]} -gt 0 ]]; then
      emit "[PARTIAL] handlers/${file##*/}: $ROUTE_PATH covered but missing: ${missing[*]}"
    else
      emit "[OK] handlers/${file##*/}: $ROUTE_PATH — happy+auth+error+isolation all covered"
    fi
  fi
done
```

### Step 2 — Audit Go store package

For each file in `$GO_STORE`:

```bash
# Find new public functions added in the diff
NEW_FUNCS=$(git diff "$RANGE" -- "$file" | grep -E '^\+func\s+(\([^)]+\)\s+)?[A-Z]\w+' | sed -E 's/^\+func\s+(\([^)]+\)\s+)?([A-Z]\w+).*/\2/')

PKG_DIR=$(dirname "$file")
TEST_DIR_TESTS=$(find "$PKG_DIR" -maxdepth 1 -name '*_test.go' 2>/dev/null)

for fn in $NEW_FUNCS; do
  if grep -qE "Test.*$fn\b|\b$fn\(" $TEST_DIR_TESTS 2>/dev/null; then
    emit "[OK] store/${file##*/}: $fn covered"
  else
    emit "[GAP] store/${file##*/}: public function $fn has no test reference"
  fi
done
```

### Step 3 — Audit Go internal packages (non-handlers, non-store)

For each file in `$GO_INTERNAL`:

```bash
# Find new public functions added in the diff
NEW_FUNCS=$(git diff "$RANGE" -- "$file" | grep -E '^\+func\s+(\([^)]+\)\s+)?[A-Z]\w+' | sed -E 's/^\+func\s+(\([^)]+\)\s+)?([A-Z]\w+).*/\2/')

PKG_DIR=$(dirname "$file")
TEST_DIR_TESTS=$(find "$PKG_DIR" -maxdepth 1 -name '*_test.go' 2>/dev/null)

for fn in $NEW_FUNCS; do
  if grep -qE "Test.*$fn\b|\b$fn\(" $TEST_DIR_TESTS 2>/dev/null; then
    emit "[OK] internal/${file##*/}: $fn covered"
  else
    emit "[GAP] internal/${file##*/}: public function $fn has no test reference"
  fi
done
```

### Step 4 — Audit TS components / hooks / API clients

For each file in `$TS_COMPONENTS`:

```bash
COMPONENT_NAME=$(basename "$file" .tsx)
# Test may be co-located as __tests__/<Name>.test.tsx or <Name>.test.tsx alongside the component
TEST_FILE_A="$(dirname "$file")/__tests__/${COMPONENT_NAME}.test.tsx"
TEST_FILE_B="$(dirname "$file")/${COMPONENT_NAME}.test.tsx"

if [[ -f "$TEST_FILE_A" ]] || [[ -f "$TEST_FILE_B" ]]; then
  TEST_FILE=$([[ -f "$TEST_FILE_A" ]] && echo "$TEST_FILE_A" || echo "$TEST_FILE_B")
  if echo "$TS_TESTS" | grep -q "$TEST_FILE"; then
    emit "[OK] components/${file##*/}: test file updated alongside"
  else
    emit "[OK?] components/${file##*/}: test file exists but NOT updated — consider whether new behavior needs new assertions"
  fi
else
  emit "[GAP] components/${file##*/}: no test file for ${COMPONENT_NAME}"
fi
```

For each file in `$TS_HOOKS`:

```bash
HOOK_NAME=$(basename "$file" .ts)
# Bridge hook tests live in tests/unit/ or co-located
TEST_HITS=$(find tests/unit src/hooks -name "${HOOK_NAME}.test.ts" 2>/dev/null | head -1)

if [[ -n "$TEST_HITS" ]]; then
  emit "[OK] hooks/${file##*/}: test exists"
else
  emit "[GAP] hooks/${file##*/}: no test for ${HOOK_NAME}"
fi
```

For each file in `$TS_API_CLIENTS`:

```bash
CLIENT_NAME=$(basename "$file" .ts)
# Bridge lib tests live in tests/api/, tests/unit/, or tests/integration/
TEST_HITS=$(find tests -name "${CLIENT_NAME}.test.ts" 2>/dev/null | head -1)

if [[ -n "$TEST_HITS" ]]; then
  emit "[OK] lib/${file##*/}: test exists"
else
  emit "[GAP] lib/${file##*/}: no test for ${CLIENT_NAME}"
fi
```

### Step 5 — Audit SQL migrations (Drizzle)

For each file in `$SQL_MIGRATIONS`:

```bash
MIGRATION_NAME=$(basename "$file" .sql | sed -E 's/^[0-9]+_//')
# Look for integration tests that reference the new table/column name
HITS=$(grep -rlE "$MIGRATION_NAME" tests/integration/ tests/api/ 2>/dev/null)

if [[ -z "$HITS" ]]; then
  emit "[GAP] migrations/${file##*/}: no test references — verify schema change is exercised"
fi
```

### Step 6 — Build the targeted test plan

Group the changed files by the minimal command needed to verify them:

```bash
# Go internal + store packages → go test that package
GO_PKG_DIRS=$(echo "$GO_INTERNAL $GO_STORE" | tr ' ' '\n' | xargs -n1 dirname 2>/dev/null | sort -u | sed 's|^|./|')

# Go handlers → test the handlers package (integration tests are co-located)
# Extract handler function names from the diff to narrow the -run filter
HANDLER_FNS=$(echo "$GO_HANDLERS" | while read f; do
  git diff "$RANGE" -- "$f" | grep -oE 'h\.[A-Z]\w+' | sort -u | sed 's/^h\.//'
done | sort -u | tr '\n' '|' | sed 's/|$//')

# TS files → vitest with matching test paths
TS_TEST_PATHS=$(echo "$TS_COMPONENTS $TS_HOOKS $TS_API_CLIENTS" | tr ' ' '\n' | while read f; do
  case "$f" in
    src/components/*)
      BASE=$(basename "$f" .tsx)
      echo "$(dirname "$f")/__tests__/${BASE}.test.tsx $(dirname "$f")/${BASE}.test.tsx"
      ;;
    src/hooks/*)
      echo "tests/unit/$(basename "$f" .ts).test.ts"
      ;;
    src/lib/*)
      echo "tests/api/$(basename "$f" .ts).test.ts tests/unit/$(basename "$f" .ts).test.ts"
      ;;
  esac
done | tr ' ' '\n' | sort -u | while read t; do [[ -f "$t" ]] && echo "$t"; done)

# Build commands
echo "## Test plan (minimal)"
[[ -n "$GO_PKG_DIRS" ]] && echo "  cd platform && go test $GO_PKG_DIRS -count=1 -timeout 120s"
if [[ -n "$GO_HANDLERS" ]]; then
  if [[ -n "$HANDLER_FNS" ]]; then
    echo "  cd platform && go test ./internal/handlers/... -run '${HANDLER_FNS}' -count=1 -timeout 120s"
  else
    echo "  cd platform && go test ./internal/handlers/... -count=1 -timeout 120s"
  fi
fi
[[ -n "$TS_TEST_PATHS" ]] && echo "  bun run test $TS_TEST_PATHS"
```

### Step 7 — Format report

```
## Test coverage — range: main..HEAD (N changed source files, M changed test files)

### Gaps (X)

[GAP] handlers/sessions.go:45 — new route POST /api/sessions (handler h.CreateSession) — no integration test references this route/handler.
  → Required tests per CLAUDE.md (happy + auth + error + cross-user):
    - TestCreateSession_HappyPath
    - TestCreateSession_AuthRequired
    - TestCreateSession_InvalidContent_400
    - TestCreateSession_Outsider_403
  → Add to: platform/internal/handlers/sessions_integration_test.go

[PARTIAL] handlers/chapters.go — new route GET /api/chapters/{chapterID} is covered, but missing: cross-user-isolation
  → Add a TestGetChapter_Outsider_404-style test asserting 404 when caller is not a member of the org owning the chapter.

[GAP] store/sessions.go — public function GetSessionsByOrg has no test reference (added at line 78)
  → Cover via platform/internal/store/sessions_test.go.

[GAP] src/components/session/SessionCard.tsx — no test file for SessionCard
  → Cover render + key interactions.

### Coverage matches (Y)

[OK] handlers/chapters.go: PATCH /api/chapters/{chapterID} — happy+auth+error+isolation all covered
[OK] src/components/library/BookCard.tsx: test file updated alongside (+2 tests)

### Test plan (minimal — only the changed code)

```bash
cd platform && go test ./internal/store/... -count=1 -timeout 120s
cd platform && go test ./internal/handlers/... -run 'TestCreateSession|TestGetChapter' -count=1 -timeout 120s
bun run test src/components/session/__tests__/SessionCard.test.tsx
```

Estimated runtime: ~15s (vs full suite: `bun run test` + `cd platform && go test ./... -count=1 -timeout 120s`)

### auto_run

`auto_run=false` (default). Pass `auto_run=true` to execute the plan above and report pass/fail per command.
```

### Step 8 — Offer to fill gaps (if `generate_missing=true`)

If the user opted in, dispatch subagents per CLAUDE.md dispatch table (docs/coding-agent.md):

- Backend test gaps (Go) → `Agent(subagent_type=codex:codex-rescue)` with a prompt listing the missing test names + file paths + the exact "happy + auth + error + cross-user" pattern from CLAUDE.md.
- Frontend test gaps (TS) → `Agent(subagent_type=general-purpose, model=sonnet)` with the missing test list + the correct `tests/` or `__tests__/` location.

Dispatch in parallel (single message, multiple Agent calls). Wait for both, then re-run Steps 1-7 to confirm the gaps closed. Report results.

DO NOT generate without explicit `generate_missing=true` — the gap report alone is the default deliverable.

## Constraints

- **Read-only by default.** Even `auto_run=true` only RUNS tests; it never writes test files. `generate_missing=true` is the only path to file writes, and it requires explicit opt-in.
- **Heuristic, not exhaustive.** The skill uses grep/diff heuristics — it can miss tests that exist but use unusual naming, and it can false-positive when a test exists but doesn't actually exercise the named function. Treat output as a starting point, not a ground truth.
- **Doesn't run coverage.** No `go test -coverprofile` / `vitest --coverage` — that's a separate concern (branch coverage) and is slow. This skill is about "does a test EXIST for the changed code", not "does that test cover every branch".
- **No estimate-based gating.** The skill prints estimated runtime but never blocks a push. If you want a hard gate, wire `auto_run=true` into a pre-push hook via `update-config`.
- **Targeted plan ≠ full CI.** `auto_run=true` runs ONLY the targeted commands. Always run `bun run test` + `cd platform && go test ./... -count=1 -timeout 120s` before merge — the targeted plan is for fast inner-loop feedback, not a substitute for the full suite.

## Quick recipes

```
/br-test-coverage                              # default: main..HEAD on feature branch, gap report only
/br-test-coverage auto_run=true                # report + execute the targeted plan
/br-test-coverage range=HEAD~3..HEAD           # last 3 commits only
/br-test-coverage paths=platform/internal/handlers  # narrow to one area
/br-test-coverage skip=ts-components           # ignore frontend gaps
/br-test-coverage include_passing=false        # problems-only
/br-test-coverage generate_missing=true        # dispatch agents to write the missing tests (interactive)
/br-test-coverage range=working-tree           # audit uncommitted changes only
```
