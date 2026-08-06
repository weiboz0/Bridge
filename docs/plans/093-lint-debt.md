# Plan 093 — Clear the lint baseline

**Status:** Drafted, not started. Created by plan 091.
**Risk tier:** A (touches `src/**` broadly plus `platform/`-adjacent typing — see `docs/reviewers.md`)

## File scope

To be enumerated per phase before each phase begins, from `scripts/lint-baseline.txt`.
A plan touching 83 files cannot declare a meaningful scope up front,
so **each phase declares its own** and the gate runs per phase.
This is a deliberate deviation from one-scope-per-plan; note it at the plan-review gate.

## Problem

`main` carries 145 ESLint violations across 83 files.
Plan 091 could not block on them — an 83-file cleanup would have swallowed a process-port plan —
so it shipped a ratchet instead: `scripts/check-lint-baseline.sh` fails on **new** violations
and tolerates the recorded ones in `scripts/lint-baseline.txt`.

The ratchet stops the debt growing. It does not repay it.
While the baseline is non-empty, `bun run lint` cannot be a plain pass/fail for a human,
and every new contributor inherits a wall of pre-existing noise.

## Current shape

| Rule | Count | Character |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 76 | Each needs a real type. Not mechanical. |
| `@typescript-eslint/no-unused-vars` | 41 | Mostly mechanical deletions. |
| `react-hooks/set-state-in-effect` | 10 | Genuine correctness smells — may be real bugs. |
| `@typescript-eslint/no-unsafe-function-type` | 3 | Needs a real signature. |
| `react/display-name` | 3 | Mechanical. |
| `next/no-html-link-for-pages` | 3 | Mechanical, but check routing intent. |
| assorted | 9 | Mixed. |

Regenerate with `bash scripts/check-lint-baseline.sh --update` before starting;
the counts will have moved.

## Phases

Ordered cheapest-first, so the baseline shrinks visibly and early.

### Phase 1 — Mechanical removals (~47)

`no-unused-vars`, `display-name`, `no-html-link-for-pages`, `no-unescaped-entities`.

Deleting an unused import is safe. Deleting an unused **function parameter** is not always —
check whether it is positional before removing it.

### Phase 2 — `react-hooks/set-state-in-effect` (10)

**Treat these as suspected bugs, not lint noise.**
`setState` in an effect commonly indicates a render loop, a missing dependency,
or state that should have been derived rather than stored.
Each one needs reading, not silencing. Some may warrant their own fix commit and a test.

If any turns out to be a real user-visible bug, stop and file it separately —
do not bury a behaviour fix inside a lint cleanup.

### Phase 3 — `no-explicit-any` (76)

The long tail. Each `any` needs a real type, and inferring one sometimes surfaces
that the underlying data shape was never pinned down.

Batch by module so review stays tractable, declaring the file scope per batch.
Where a correct type genuinely cannot be determined, `unknown` plus a narrowing guard
beats `any` — and beats an `eslint-disable`, which just moves the debt somewhere the ratchet cannot see.

### Phase 4 — Empty the baseline

Reduce `scripts/lint-baseline.txt` to its header, and make `ci-local.sh` run plain `bun run lint` again.
Keep `check-lint-baseline.sh` in the tree: the ratchet is how the debt is prevented from returning.

**Verification:** `bun run lint` exits 0; `scripts/lint-baseline.txt` has no entries;
`bash scripts/ci-local.sh --fast` passes.

## Rules

- **Never `--update` the baseline to absorb a violation.** It only ever shrinks.
  The script says so; this plan is where that would be most tempting.
- **Never add `eslint-disable` to hit a number.** A disable comment is invisible to the ratchet,
  which converts measurable debt into hidden debt.
- Run `bash scripts/ci-local.sh --fast` after every phase. A lint fix that breaks a test is not a fix.

## Out of scope

- ESLint rule configuration changes. If a rule is genuinely wrong for Bridge, that is its own decision,
  argued on merits and recorded in `docs/architecture/decisions.md` — not settled by silencing it here.
- **No integration-tests phase**: no API surface, realtime protocol, or auth/persistence plumbing changes.
  Existing tests are the regression net, which is why they run after every phase.
  Exception: if Phase 2 uncovers a real bug, that fix carries its own test.

## Plan Review

_Pending — Tier A, 4-way._
