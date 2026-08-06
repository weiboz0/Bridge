---
name: br-scenario-debug
description: Take ONE failing Bridge scenario (an E2E spec, a live-LLM test, a reproducible bug) and drive it to green non-stop — run, diagnose via the bug-investigation gate, fix, re-run — under retry caps and hard stop conditions. Requires a plan ID and its file scope up front, and refuses to edit outside it. Use when the user says "get this test passing" / "debug this until it works" / "keep at it until green".
---

# br-scenario-debug

One scenario, looped to green or to a cap. Autopilot's mechanics applied to debugging
rather than to shipping a plan.

## Required inputs — refuse without them

| Input | Why it is mandatory |
|---|---|
| `scenario` | The single failing test or reproduction. One, not a suite. |
| `plan_id` | The plan authorising this work. |
| `file_scope` | The plan's `## File scope`. **Edits outside it are refused.** |

The scope binding is not bureaucracy. This skill fixes repeatedly and unattended; with
only a failing test name as input, "make the test pass" licenses editing anything in
the repository — including deleting the assertion. The declared scope is what makes
the loop safe to leave running.

If the user has no plan for this work, write one first, or run a single pass of
`br-debug-from-live-failure` and hand back the diagnosis instead.

## Caps

| Cap | Default | On reaching it |
|---|---|---|
| `max_fix_attempts` | 5 | Stop, report every hypothesis tried and why each failed |
| `max_diagnosis_rounds` | 3 | Stop — repeated diagnosis without progress means the framing is wrong |
| `max_total_turns` | 40 | Stop and summarise |

A cap is a stop, never a prompt to try harder. Reaching one is information: the
scenario is not what it appears to be.

## Loop

1. **Run** the scenario. `br-live-tests` if it is a live tier — respect its hazards:
   never run E2E without a pinned `E2E_BASE_URL`, never bill provider calls unasked.
2. **Green?** Stop. Report what changed and confirm nothing else regressed
   (`scripts/ci-local.sh --fast`).
3. **Diagnose** via `br-debug-from-live-failure` — the 2-way gate. Do not skip to a fix
   because the cause "looks obvious"; that is exactly when the loop burns its attempts
   on the wrong thing.
4. **Fix**, inside `file_scope` only, dispatched per `docs/coding-agent.md` (Codex for
   Go, Sonnet for frontend and tests).
5. **Re-run.** Increment the attempt counter. Back to 2.

## Hard stops — pause regardless of caps

- Any hard safeguard in `AGENTS.md` — secrets, database or student data, auth and
  tenancy, history rewriting, `gh pr merge --admin`.
- A fix would touch a file outside `file_scope`.
- **The fix would weaken the test rather than the code** — deleting an assertion,
  loosening a matcher, adding a skip, widening a timeout to hide a race. This is the
  failure mode a green-seeking loop is most prone to, and the one a human most needs
  to see. Surface it; do not do it.
- Two consecutive diagnoses contradict each other.
- The scenario starts passing without any change — a flake, which is a different
  investigation and must not be silently counted as success.

## Report

Whether it ends green or capped: the scenario, the final state, each hypothesis tried
with its outcome, the diff, and whether `ci-local.sh --fast` is clean. If it ended
capped, say plainly that it is unresolved — a capped run reported as "mostly working"
is worse than one reported as failed.
