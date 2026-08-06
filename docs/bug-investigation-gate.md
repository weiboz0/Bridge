# Bug investigation gate (2-way diagnosis)

Distinct from the plan-review and code-review gates.
Those evaluate a *proposed* plan or diff and aim at consensus to ship.
This one is **read-only diagnosis** — no fixes proposed by the agents — and aims at *triangulating* the real root cause.

## When to use

- A fix has misfired, in production or in an earlier PR.
- The reported behavior's root cause isn't obvious from a single read of the code.
- Multiple hypotheses are plausible and you don't yet know which to fix.

## Roster

| # | Investigator | Dispatch | Model |
|---|--------------|----------|-------|
| 1 | Claude self-investigation | inline by orchestrator | Opus 5 |
| 2 | Codex | `codex:codex-rescue` subagent | `gpt-5.6-sol` |

Diagnosis stays a 2-way triangulation.
The independent Claude reviewer and GLM join at the plan-review and code-review gates, not here.

## Procedure

1. **Dispatch Codex in parallel with the inline self-investigation.** The prompt must:
   - State the bug list — one paragraph per bug, symptom plus reproduction context.
   - Point at suspected `file:line` touch points so the agent doesn't burn context rediscovering the codebase.
   - Say explicitly: **"DO NOT WRITE CODE — diagnose only."**
     Codex runs with full filesystem access, so this is prompt-enforced only (see `docs/reviewers.md`).
   - Specify the format: `[BLOCKER]` / `[CONCERN]` / `[NIT]` per finding, file:line refs, one "top hypothesis" line per bug.
   - Cap word count (~600–800) so the report stays scannable.

2. **Run the self-investigation while Codex works.**
   It has the conversation context and recent-edit memory the external lacks,
   so it catches "what changed last commit" and "what the user said earlier" angles.
   Not a rubber stamp — if you can't produce at least one independent hypothesis, you haven't looked hard enough.

3. **Cross-check when both return.** Per bug:
   - **Consensus** — both converge on the same cause. High confidence; act on it.
   - **Unique insight** — one finds what the other missed. Often the most valuable result; take it seriously even if unconfirmed.
   - **Contradiction** — the codebase is genuinely ambiguous. Read it yourself or ask the user for more context.

4. **Plan the fix**, then run the normal plan-review and code-review gates.

## Skip the gate when

- The bug is a typo, missing import, or other "stare at it for ten seconds" issue.
- The repro is fully reduced and the user named the root cause.
- The fix is a one-line revert.

## Don't skip when

- A prior PR's fix didn't actually resolve the reported bug.
- Three or more bugs are reported at once and you suspect a shared root cause.
- The bug only reproduces against real session data and the diff is multi-file.

## Bug fixes under autopilot

When this gate applies, autopilot runs it end to end:
2-way diagnosis → fix plan → plan-review gate → implement → code-review gate → PR → `pre-merge-guard --pr` → merge,
pausing only for genuine judgment forks (ambiguous root cause, a fix needing a design decision)
and the hard safeguards in `AGENTS.md`.
A trivially-scoped fix — the skip cases above — goes straight to the fix and the code-review gate, still through merge.

## Why these two

- **Claude self-investigation** holds the conversation context and recent-edit memory.
  Best at "what did we just change that could have broken this" and at integrating user-supplied repro data.
  Risk: motivated reasoning when Claude wrote the broken code — which the parallel external is there to catch.
- **Codex** is strongest at file:line precision and pinning narrow code paths.
  It verifies by reading source rather than grep-and-reason, so its findings tend to be high-precision.
