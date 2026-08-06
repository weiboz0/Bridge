---
name: br-autopilot
description: Use when the user says "autopilot plan-NNN" / "run plan-NNN unattended" / "ship plan-NNN while I'm away" / "go autonomous on this plan". Pre-authorizes Claude to walk one named plan through the full Bridge cadence (Design→Plan→Build→Verify→Review→Ship) without per-step approval, while strictly enforcing AGENTS.md's CRITICAL rules (branch-first, plan-review gate, phase-by-phase commits, code-review gate, post-execution report). Three retry caps (review-rounds, test-fix-attempts, total-turns) prevent runaway loops; named stop conditions auto-pause and surface to the user. Optional auto_merge=true ships after PR. Read this file end-to-end before the first phase commit; the pre-auth allowlist is load-bearing.
---

# br-autopilot

Pre-authorize Claude to run ONE named Bridge plan from current state through merge, following AGENTS.md's protocol strictly. Saves you "yes / merge / 1" prompts for the routine cadence steps; pauses for genuine judgment calls and risky operations.

## When to invoke

- "Run plan-185 on autopilot" / "autopilot plan-NNN" / "ship plan-NNN unattended".
- "I'm stepping away — keep going on plan-NNN until [it's mergeable | merged]".
- Overnight / weekend ship of a plan whose design + scope are already locked.

## When NOT to invoke

- Plan-design phase ("help me design plan-NNN") — design needs your judgment + AskUserQuestion checkpoints. Autopilot starts AFTER the plan file passes the plan-review gate.
- Cross-cutting refactors that span multiple plans simultaneously.
- Anything where the plan file says "scope TBD" or has "[OPEN]" sections.
- If you don't already trust the plan as written, autopilot will faithfully execute the wrong thing.

## Inputs

| Arg | Default | Meaning |
|---|---|---|
| `plan_id` | **required** | Plan number, e.g. `185`. Skill reads `docs/plans/$plan_id-*.md`. |
| `start_phase` | first incomplete phase (read from plan file) | Phase to start on. Use to resume after a manual interruption. |
| `end_phase` | last phase | Stop after this phase (don't ship). Use when you want to autopilot a subset then review yourself. |
| `auto_merge` | `false` | If `true`, squash-merge via `gh pr merge --squash --auto` after PR + green gates. NEVER `--admin`. See "Auto-merge guards" below — multiple conditions block the merge even when this is true. |
| `max_review_rounds` | `5` | Max fix-then-re-review cycles at any single gate (plan-review OR code-review). At cap with unresolved blockers → pause. |
| `max_test_fix_attempts` | `5` | Max "edit → re-run failing tests" cycles per phase. At cap → pause. |
| `max_total_turns` | `1000` | Global safety net. Counts assistant turns including tool calls. At cap → pause with a state-summary report. |
| `pause_on` | `blocker,security,destructive,scope_drift` | Comma-sep stop conditions (see "Stop conditions" below). Set `never` to disable user pauses (dangerous — overridden by hard safeguards). |
| `notify` | `push` | `push` (PushNotification on milestones: phase complete, gate cleared, merged, paused) \| `none`. |
| `dry_run` | `false` | If `true`, walks the plan + emits the action plan without executing — useful to preview what autopilot would do. |
| `state_file` | `.claude/br-autopilot-state.json` | Where to persist progress (gitignored). Survives interruptions. |

## What's pre-authorized

When autopilot is active, the following actions execute WITHOUT pausing for confirmation:

- `git checkout -b feat/plan-$N-...` (creating the plan's feature branch — always before any work, per AGENTS.md)
- `git commit` on the feature branch
- `git push -u origin <feature-branch>` (pushing to remote)
- `gh pr create` (opening the PR)
- File `Edit` / `Write` / `MultiEdit` within the plan's scope (per the plan file's `## File scope` section)
- `Agent` dispatches per AGENTS.md dispatch table (backend Go in `platform/` → `codex:codex-rescue`; frontend `src/` + all test code → Agent with `model: sonnet`; complex/cross-domain → Opus subagent)
- plan-review gate dispatch at the plan's risk tier (`docs/reviewers.md`): Tier B = Claude self on Opus 5 + `codex:codex-rescue`; Tier A adds an independent fresh-context Opus reviewer + GLM
- code-review gate dispatch at the plan's risk tier (`docs/reviewers.md`), all reviewers in parallel
- `Bash` calls to `go test`, `vitest`, `playwright` (test runners)
- `Bash` calls to `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bun run test:e2e`
- `Bash` calls to read-only git / gh commands (`status`, `log`, `diff`, `pr view`, `pr checks`)
- Updating the plan file's `## Code Review`, `## Post-execution report`, and `## Phase X — STATUS` sections

## What's NEVER pre-authorized (always pause)

These ALWAYS pause and surface to the user, regardless of `pause_on=never`:

- `git push --force` / `--force-with-lease` to any branch
- `git reset --hard` on shared history
- `git branch -D` on a branch with unmerged commits
- `git checkout main` followed by `git commit` (direct commit to main is a AGENTS.md violation)
- `gh pr merge --admin` to main — ALWAYS a hard safeguard pause, never performed by autopilot (`AGENTS.md`)
- Edits to `AGENTS.md`, `docs/coding-agent.md`, `docs/development-workflow.md`, `docs/reviewers.md`, or anything under `.github/workflows/` (process / architecture changes need human judgment)
- Edits that touch the secrets surface: `.env*` (other than `.env.example`), anything matching `*credentials*` / `*api_key*` / `*token*` patterns
- Plan-scope expansion (adding deliverables not in the plan file's phases — autopilot can only complete what's already specified)
- Any `gh` command that comments on / closes / reviews someone else's PR or issue
- Any external network call beyond `gh` and the plan's own test execution

## Auto-merge guards (when auto_merge=true)

Even with `auto_merge=true`, the merge is BLOCKED (pause for user) if ANY of these is true after the PR is open:

| Guard | Trigger |
|---|---|
| `[OPEN]` BLOCKER | Plan file's `## Code Review` section has any `[OPEN]` line tagged BLOCKER |
| `[OPEN]` items > 0 | Any `[OPEN]` items remain, even at CONCERN/NIT severity |
| Tests FAILED | `bun run test` exit code non-zero, OR `cd platform && go test ./... -count=1 -timeout 120s` exit code non-zero, OR `bun run test:e2e` exit code non-zero for any affected E2E suite |
| Lint / type-check FAILED | `bun run lint` or `bunx tsc --noEmit` exit code non-zero on the PR's HEAD commit |
| Plan-scoped test FAILED | Any test matching the plan's component scope (vitest) or any Go test in packages touched by the diff failed |
| Sensitive-path touch | PR diff touches any path in the "secrets surface" list above |
| Missing integration test | PR adds a route in `platform/` (`r.Get/Post/Patch/Put/Delete(...)`) without a corresponding integration test (AGENTS.md: every new Go API endpoint needs an integration test) |
| Scope drift | PR diff includes files not listed in the plan file's `## File scope`, and they're not trivially-named test files |
| Diff size 2× plan estimate | PR has more added lines than the plan's estimated total × 2 (heuristic — flags significant scope creep) |
| **No required check** | `gh pr checks <num>` returns zero rows, or every row is advisory rather than required. See below — this one is not optional. |
| **Scope snapshot mismatch** | The plan file's `## File scope` or its commit SHA differs from the values recorded at gate pass. See below. |

If any guard fires, autopilot writes the reason to the state file, sends a PushNotification, and pauses. User says "merge" to override + ship anyway, or interrupts to investigate.

### The required-check guard is load-bearing

`auto_merge=true` is only safe because a *required* CI check has independently
verified the branch. If no required check exists, the sole pre-merge evidence is a
script this same agent ran on itself — which is not independent verification at all.

So autopilot asserts at runtime, immediately before merging, that `gh pr checks`
reports at least one **required** passing check. It does not assume the repository is
configured correctly; branch-protection rules can be removed, and `.github/workflows/`
can be reverted independently of this skill.

Never merge with `--admin`. `--admin` exists precisely to bypass required checks, so
using it would defeat this guard. It is a hard safeguard pause in `AGENTS.md`.

### The scope snapshot

"Scope is fixed at gate time" only means something if the value is *recorded*.
Otherwise a resumed run re-reads whatever the plan file says now, and a widened scope
looks identical to the original.

At gate pass, write into the state file:

```json
"scope_snapshot": {
  "plan_sha": "<git rev-parse HEAD:docs/plans/NNN-*.md>",
  "file_scope": ["<each path from ## File scope>"]
}
```

Every pre-flight re-derives both and compares. A mismatch means either the plan was
edited after approval or the scope was widened mid-run — both are pauses, not warnings.
Widening scope requires the user to say so explicitly, and the gate to be re-run.

## Stop conditions (pause_on)

The default `pause_on=blocker,security,destructive,scope_drift` covers:

- `blocker` — any review finding tagged `[BLOCKER]` that the fix loop didn't resolve within `max_review_rounds`
- `security` — model detects the work is touching auth, secrets, billing/financial, or any path with `auth|secret|token|credential|webhook` in the name. Pause before the first edit to that path.
- `destructive` — any of the "never pre-authorized" list above is needed to make progress
- `scope_drift` — plan file's phase scope doesn't match what implementation actually requires; e.g., a phase says "add 1 endpoint" but turns out 3 are needed

Optional additions: `failing_tests` (pause on first phase-test failure instead of using `max_test_fix_attempts`), `merge_conflict` (pause on git merge conflict), `agent_refusal` (pause if a dispatched agent refuses or returns "I can't do this"), `cost_threshold:<N>` (pause after N codex / glm dispatches — proxy for credit burn).

`never` disables user-pause stop conditions — autopilot proceeds through everything below the "never pre-authorized" hard list. **Strongly discouraged.** The hard list is the only safety net at that point.

## Workflow

### Step 0 — Validate inputs + load state

```bash
PLAN_FILE=$(ls docs/plans/$plan_id-*.md 2>/dev/null | head -1)
[[ -z "$PLAN_FILE" ]] && abort "No plan file for plan_id=$plan_id"

STATE_FILE="${state_file:-.claude/br-autopilot-state.json}"
mkdir -p "$(dirname "$STATE_FILE")"
[[ ! -f "$STATE_FILE" ]] && echo '{"version":1,"runs":[]}' > "$STATE_FILE"

# Validate plan is in a runnable state
grep -q "Plan-review gate.*PASSED\|Codex.*APPROVE" "$PLAN_FILE" || pause "Plan-review gate has not cleared on $PLAN_FILE — autopilot starts AFTER plan-review approval, not before."
```

Refuse to start if the plan-review gate has not cleared. Autopilot is not a substitute for the plan-review gate; it's an executor for already-approved plans.

### Step 1 — Determine starting state

Read the plan file to extract:
- Phase list + per-phase status markers
- `## File scope` section (REQUIRED — a plan without one cannot be gated)
- Estimated diff size (if mentioned)

Cross-reference with git:
- Current branch (must be feature branch matching `feat/plan-$plan_id-*` OR create it — ALWAYS before any commits)
- Last commit on branch (which phase does it correspond to?)
- Unpushed commits (if any)

Compute `start_phase`:
- If user passed `start_phase=N`, use it
- Else, scan plan file for the first phase marked NOT COMPLETE / IN PROGRESS / unmarked
- If plan file has no phase markers, start from phase 1

### Step 2 — Per-phase loop

For each phase from `start_phase` to `end_phase`:

1. **Pre-flight check.** Re-read the plan file — it may have been edited mid-run. Re-derive the plan file's commit SHA and its `## File scope`, and compare both against `scope_snapshot` in the state file. Any mismatch pauses, regardless of `pause_on` settings: it means the approved scope is no longer the scope being executed. Then confirm the working diff has not expanded beyond that scope.
2. **Dispatch the work** per AGENTS.md dispatch table. Backend phases (Go in `platform/`) → `codex:codex-rescue` subagent. Frontend phases (`src/`) + all test code → Agent with `model: sonnet`. Cross-cutting / glue work → Opus subagent inline.
3. **Run phase tests.** Plan should specify which tests to run. If not, infer from changed paths: Go packages touched → `cd platform && go test ./... -count=1 -timeout 120s`; frontend files touched → `bun run test`; `bun run lint` + `bunx tsc --noEmit` always.
4. **Fix loop.** If tests fail, dispatch a fix agent (Codex for backend, Sonnet for frontend) with the failure output. Re-run tests. Cap at `max_test_fix_attempts`.
5. **Self-review.** Quick Claude inline check (on Opus 5) of the diff: any obvious omissions vs the plan's phase scope?
6. **Commit phase.** `git commit -m "plan $plan_id phase $N: <plan's phase title>"`. Use a HEREDOC per AGENTS.md commit conventions.
7. **Update plan file.** Mark phase as COMPLETE with commit SHA. Run an `Edit` on the plan file.
8. **Update state file.** Record phase complete + commit SHA + test results.
9. **Notify (if `notify=push`).** PushNotification: "Plan-NNN Phase N committed."

### Step 3 — Plan-review gate (skip if plan already passed)

Already gated by Step 0 — autopilot won't start unless plan-review has cleared.

### Step 4 — Code-review gate (risk-tiered)

After ALL phases complete (or `end_phase` reached):

1. Dispatch in parallel (single message, two Agent tool_use blocks):
   - `codex:codex-rescue` for technical / wire-shape verification
   - `opencode:opencode-review` with `--model volcengine-plan/glm-5.2` for downstream-consumer / UX / observability (GLM is review-only — no code edits)
2. Run Claude self-review inline on Opus 5.
3. Record all findings in plan file's `## Code Review` section per `docs/code-review.md` format, tagged `[claude-self] / [codex] / [opus] / [glm]`.
4. If `[OPEN] [BLOCKER]` or `[OPEN] [CONCERN]` findings exist:
   - Dispatch fix agents per AGENTS.md dispatch table
   - Commit fixes
   - Re-run gate (incrementing review-round counter)
   - At `max_review_rounds`, pause with state-summary
5. If only `[OPEN] [NIT]` findings remain after `max_review_rounds`, treat as APPROVED — record NITs in plan file as `[WONTFIX]` with brief reason.

### Step 5 — Pre-ship checks

Before opening PR:

1. Run the full test suite:
   - `bun run test` (Vitest, requires `bridge_test` DB per `docs/setup.md`)
   - `cd platform && go test ./... -count=1 -timeout 120s` (for any Go package changed)
   - `bun run lint`
   - `bunx tsc --noEmit`
   - `bun run test:e2e` (requires Next.js + Go platform + Hocuspocus all running — skip if environment not available, record in state notes, do NOT treat skip as pass)
2. Verify every new Go route in `platform/` has a corresponding integration test (happy + auth + error + cross-user isolation).
3. Update plan file's `## Post-execution report` section.
4. Cross-check the auto-merge guards (even if `auto_merge=false`, knowing the guard state is useful information for the user).

### Step 6 — Push + open PR

1. `git push -u origin <feature-branch>`
2. `gh pr create` with title `Plan NNN: <description>` and body derived from the plan's summary + per-phase commits.
3. Notify: PushNotification "Plan-NNN PR opened: <url>".

### Step 7 — Ship (auto_merge=true only)

If `auto_merge=false` (default): END HERE. PushNotification "Plan-NNN ready to merge — `gh pr merge <num> --squash --auto --delete-branch`".

If `auto_merge=true`:

1. Evaluate all auto-merge guards (see "Auto-merge guards" above).
2. If ANY guard fires, write the reason to state file, PushNotification "Plan-NNN auto-merge BLOCKED: <reason>", pause.
3. If all guards pass:
   - `gh pr merge <num> --squash --auto --delete-branch`
   - `git checkout main && git pull origin main`
   - Delete local feature branch
   - PushNotification "Plan-NNN auto-merged as <sha>".
4. Update state file with final status.

### Step 8 — Final report

Print a structured report:

```
## Autopilot complete — plan-185

### Phases
✓ Phase 1: backend foundation (commit ae04439)
✓ Phase 2: frontend components (commit c2346fe)
✓ Phase 3: tests + e2e (commit 3ba40f5)

### Review gates
✓ Code-review r1: 2 BLOCKERS + 3 CONCERNS → all FIXED in r2
✓ Code-review r2: APPROVE WITH NITS x3 (1 NIT [WONTFIX], 2 [FIXED])

### Ship
✓ PR #373 opened
✓ Auto-merged as 40f79c4

### Counters used
- review-rounds: 2 / 5 (code-review only; plan-review pre-cleared)
- test-fix-attempts: 1 / 5 (one phase had 1 failing test fixed)
- total-turns: 142 / 1000

### Notes
- Plan-185 state file: .claude/br-autopilot-state.json (run #1)
```

## State file shape

`.claude/br-autopilot-state.json` (gitignored — per-machine, like the rest of `.claude/*`):

```json
{
  "version": 1,
  "runs": [
    {
      "run_id": "2026-06-08-185-1",
      "plan_id": 185,
      "started_at": "2026-06-08T14:00:00Z",
      "ended_at": "2026-06-08T16:30:00Z",
      "status": "merged",
      "auto_merge": true,
      "branch": "feat/185-post-attachments",
      "pr_number": 373,
      "merge_commit": "40f79c4",
      "phases": [
        {"phase": 1, "commit": "ae04439", "tests_passed": true, "fix_attempts": 0},
        {"phase": 2, "commit": "c2346fe", "tests_passed": true, "fix_attempts": 0},
        {"phase": 3, "commit": "3ba40f5", "tests_passed": true, "fix_attempts": 1, "notes": "PostRow ternary fix"}
      ],
      "review_rounds": {"plan_review": 0, "code_review": 2},
      "counters": {"total_turns": 142, "test_fix_attempts_max": 1},
      "guards_evaluated": {"all_passed": true},
      "notes": []
    }
  ]
}
```

## Constraints

- **Reads AGENTS.md + docs/development-workflow.md FIRST.** Both may have been edited since this skill was written. The skill's audit rules are summaries; the source-of-truth files are the actual contract.
- **One plan per invocation.** Autopilot doesn't chain — finish plan-185, then a new invocation for plan-186. Lets each run produce a clean state-file entry + post-execution report.
- **No silent test skips.** If a test step is skipped (timeout, flaky, environment not ready, etc.), it's recorded in state file `notes` AND surfaced in the final report. Never silently treat a skip as a pass.
- **State file is the recovery anchor.** If autopilot is interrupted, the next invocation reads the state file to resume from the last completed phase. Don't manually edit the state file unless instructed.
- **PushNotification politeness.** Notifications fire only at milestones (phase complete, gate cleared, paused, merged) — not per-edit or per-tool-call. The goal is "you can step away and trust autopilot to surface the few moments worth attention."
- **No automatic process retrospective.** Autopilot ships the plan but doesn't audit its own developer-side behavior. If you want a post-merge retrospective on autopilot's cadence (which gates passed, what tests ran), inspect the plan file's review sections + `git log` directly. For a product-side audit, use `/investigate-errors`.

## Quick recipes

```
/br-autopilot plan_id=185                                     # default: stop at PR, wait for "merge"
/br-autopilot plan_id=185 auto_merge=true                     # full unattended including merge
/br-autopilot plan_id=185 start_phase=3                       # resume from phase 3 (after manual interruption)
/br-autopilot plan_id=185 end_phase=2                         # do phases 1+2 only, stop before phase 3
/br-autopilot plan_id=185 dry_run=true                        # preview the action plan without executing
/br-autopilot plan_id=185 pause_on=blocker,security,failing_tests  # stricter pause behavior
/br-autopilot plan_id=185 max_review_rounds=3                 # tighter cap than the default 5
/br-autopilot plan_id=185 auto_merge=true notify=none         # no push notifications (silent unless paused)
```
