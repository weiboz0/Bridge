# Plan 091 — Port the PowerMarket development process into Bridge

**Branch:** `feat/091-dev-process-port`
**Status:** Revision 2 — revised after round-1 4-way plan review (all three external reviewers: CHANGES REQUESTED)
**Sources:** `../powermarket` (`AGENTS.md`, `docs/`, `scripts/`) and branch `chore/migrate-skills` (four skills already ported from `magicburg`)

## Problem

Bridge and PowerMarket share an operator and a development philosophy, but Bridge's process has drifted behind.
Round-1 review corrected several of this section's original claims; the corrected list follows.

1. **No autopilot rule.** Bridge has an orphaned `.claude/br-autopilot-state.json` (plan 090, paused after Phase 3) but no autopilot skill on `main` and no rule describing the mode.
2. **Narrower review gates.** Bridge runs 2-way plan review and 3-way code review. PowerMarket runs 4-way on both.
3. **No bug-investigation gate.** No read-only diagnosis pattern; every bug goes straight to a fix.
4. **Integration tests are a convention, not a gate.** The rule lives in prose; PowerMarket requires a *named integration-tests phase* reviewers must reject a plan for omitting.
5. **LLM tests have no kill switch — corrected.** Revision 1 claimed Bridge had no live-LLM tier. **That was wrong.** `tests/llm/providers.test.ts` and `tests/llm/guardrails.test.ts` call real Anthropic / OpenAI / Gemini / DashScope endpoints, gated only by `describe.skipIf(!process.env.*_API_KEY)`, and they sit inside vitest's default `include: ["tests/**/*.test.ts"]`. The real gap is the inverse of the original claim: live tests exist and **bill real money on any run where a key happens to be exported**, with no `CI=1` semantics to gate them. Separately, `platform/internal/llm/` (Go) *is* mock-only — zero `Getenv("CI")` anywhere under `platform/`.
6. **No local pre-merge gate, and no remote one either.** Bridge has no `ci-local.sh`, no collision guard, and **no `.github/` directory at all** — so `AGENTS.md`'s existing "check `gh pr checks` before merging" is already vacuous.
7. **No cross-cutting decisions doc.**
8. **Stale model pins.** Docs pin Opus 4.7 and GLM 5.1.
9. **Skills are unshareable.** `.gitignore:61` ignores `.claude/` wholesale — 0 tracked files. Any skill written there is invisible to every other session.

## Goal

Bridge's process becomes equivalent to PowerMarket's in rigor, with Bridge's stack substituted and with rules re-derived where PowerMarket's original rationale does not transfer to a teaching platform holding real student data.

## Decisions

| Fork | Decision | Source |
|---|---|---|
| Scope | Full port, adapted. | User |
| Autopilot | **Full lifecycle through squash-merge (`auto_merge=true`), with an expanded hard-safeguard list** covering database and student-data mutation. | User, after review raised the data-loss gap |
| Gate width | **Risk-tiered.** 4-way for auth, migrations, student data, and cross-cutting plumbing; 2-way for UI, copy, and docs. | User, after review argued uniform 4-way imports PowerMarket's money-movement rationale |
| Skills | **Adopt `chore/migrate-skills`** (four skills already Bridge-adapted from `magicburg`), add the remaining three, un-ignore `.claude/skills/`. | User |
| Claude model slots | **Opus 5 for all four Claude slots.** Revision 1 pinned plan review to Fable 5; the round-1 Fable reviewer **failed mid-gate on "out of usage credits"** and had to be re-run on Opus. A pin that fails under load is not a pin. Fable stays documented as an optional substitute when credits allow, never as the default. | Round-1 gate evidence |
| GLM model string | `volcengine-plan/glm-5.2` — the only GLM-carrying provider in `~/.config/opencode/opencode.json`. PowerMarket's `opencode-go/glm-5.2` names a provider that does not exist on this machine. | Verified |
| Codex model | `gpt-5.6-sol`, `model_reasoning_effort = "high"` (`~/.codex/config.toml`). Pin it explicitly in `docs/reviewers.md` rather than saying "Codex default". | Verified |
| Backend test authorship | **Keep Bridge's existing rule — all tests to Sonnet.** Revision 1 flipped this to Codex citing only "adopt PowerMarket's split". Review correctly noted that reverses a deliberate Bridge decision with no Bridge-side rationale. | Round-1 review |
| Branch home | New branch off `main`. | User |
| Orphaned tree changes | Commit the `CODEX.md` deletion, gitignore `.codex-buddy/` and `*.un~`, delete `..env.un~`. | User |

## Out of scope

- **No integration-tests phase.** The exemption boundary is now defined rather than self-asserted: this plan changes no file under `platform/`, `src/`, `e2e/`, `drizzle/`, or `tests/`. Phase 4 nonetheless ships executable shell and is covered by real executable tests — see its testing section. Revision 1 called this plan "documentation-only", which was inaccurate for a plan shipping shell scripts; the exemption rests on the untouched-surface boundary, not on the docs-only label.
- PowerMarket's Rust/cargo/sqlx conventions, GPU tiering, `config.toml` conventions, seller economics.
- Executing the LLM-test remediation. Phase 7 drafts plan 092; it does not run it.
- Migrating plans 001–090 to the new review format.

## Phase ordering

Phases 1–3 are a **single atomic cutover**: they ship in one commit, because Phase 1 installs rules whose supporting workflow Phase 2 supplies, and an agent reading the branch between them would face rules with dangling references. Round-1 review flagged this as a blocker. Phases 4–7 are independently revertable and may be separate commits.

### Phase 1 — Governance files + tree hygiene

- Rewrite `AGENTS.md` as the canonical agent-agnostic instruction set. **Do not inline `Project Structure` or `Running the App`** — link to `docs/project-structure.md` and `docs/setup.md` instead; Revision 1 duplicated both and created a drift surface.
- Reduce `CLAUDE.md` to a thin `@AGENTS.md` pointer.
- Delete `CODEX.md`.
- `.gitignore`: replace the blanket `.claude/` with `.claude/*` + `!.claude/skills/` (the shape `chore/migrate-skills` already uses); add `.codex-buddy/` and `*.un~`. Delete `..env.un~`.

**Hard safeguards — always pause, regardless of mode.** Expanded past Revision 1 after review found it omitted every data-mutating action:

- *Secrets*: `.env*` except `.env.example`, `.gh-token`, `.oauth-state-secret.local`, `*credential*` / `*api_key*` / `*token*` / `*secret*`.
- *Database and student data* (**new — the gap review called the most serious**): generating or applying any drizzle migration against a non-test database; `db:push` / `db:migrate`; `scripts/seed_*.sql`; content import commands. Bridge holds real teacher and student work and has no down-migrations. The prior autopilot run applied migration 0027 to the live `bridge` DB, so this is demonstrated, not hypothetical.
- *Auth and tenancy* (**new**): `platform/internal/middleware` session verification, org-tenancy scoping, Hocuspocus signed tokens, admin impersonation. A permissive change here leaks cross-org student data while every test still passes.
- *History and remote*: `git push --force`, `reset --hard` on shared history, a direct commit to `main`, `git branch -D` with unmerged commits, `gh pr merge --admin`, any `gh` write against a PR the agent does not own.
- *Process*: plan-scope expansion beyond the plan's declared file scope; unresolved `[OPEN]` findings at the review round-cap; a failing `pre-merge-guard.sh` or `ci-local.sh`.
- *Governance docs*: edits to `AGENTS.md`, the `CLAUDE.md` pointer, `docs/{coding-agent,development-workflow,reviewers}.md`, `.github/workflows/`. **Trigger refined** — review showed Revision 1's rule was circular: `docs/architecture/decisions.md` is the doc plans are *supposed* to update, so pausing on it would pause exactly the highest-value plans, and with Step 2's user-approval pause deleted, "except when the user explicitly asks" had no moment at which anyone could ask. The rule now triggers on edits **outside the plan file's declared file scope**, and `decisions.md` is excluded from the pause when the plan declares it in scope.
- *Judgment forks* (**restored from PowerMarket, dropped in Revision 1**): surface any genuine scope / architecture / trust-model / breaking-change decision via `AskUserQuestion`, then proceed.

**Verification:** `git check-ignore .codex-buddy` exits 0; `git check-ignore .claude/skills` exits 1; `git ls-files .claude/skills | wc -l` > 0. For `CODEX.md`, the check is `grep -rl 'CODEX\.md' --include='*.md' .` returns only `docs/reviews/` paths — Revision 1's "no doc references it as live guidance" was ungreppable.

### Phase 2 — Workflow + reviewer docs

| File | Change |
|---|---|
| `docs/development-workflow.md` | Steps 1–6 rewritten. Step 2's "Get user approval" is replaced by the plan-review gate. Step 2 gains the named integration-tests phase requirement. Step 4 gains acceptance-criteria confirmation. Bridge's single-plan-branch / one-PR-per-plan rules retained verbatim. |
| `docs/reviewers.md` | **Risk-tiered** gate tables with an explicit routing rule for which tier a plan falls in. Pins: Opus 5 (all Claude slots), Codex `gpt-5.6-sol`, `volcengine-plan/glm-5.2`. Adds full-blocking consensus, `max_review_rounds`, source tags, and the reviewer duty to reject a plan missing its integration-tests phase. Notes that Codex runs `approval_policy = "never"` + `sandbox_mode = "danger-full-access"`, so "read-only" is prompt-enforced only. |
| `docs/coding-agent.md` | Area-based dispatch. Tests stay with Sonnet. Pins refreshed. |
| `docs/code-review.md` | Align status + source tags. |
| `docs/bug-investigation-gate.md` | **New.** 2-way read-only diagnosis (Claude self on Opus 5 + Codex). |

**Verification:** every cross-reference between the six docs resolves to a real file and a real heading (scripted check, not eyeball); no doc still claims an unconditional 2-way or 3-way gate.

### Phase 3 — New reference docs

- **`docs/architecture/decisions.md`** — numbered entries (`§N`, matching PowerMarket's citation style so `decisions.md §14`-style references work) seeded from Bridge's existing decisions: auth, org/tenant context, drizzle persistence, error shaping, Yjs realtime, LLM backend factory, Go proxy-route boundary.
- **`docs/testing.md`** — per-tier commands and env vars: vitest, Go, E2E, and the LLM tiers including the new kill switch.

**Verification:** every command in `docs/testing.md` is executed once and its exit status recorded in the post-execution report.

### Phase 4 — Guard + CI scripts

Port PowerMarket's actual implementations rather than re-specifying them. Round-1 review found Revision 1's spec wrong in three ways, all now corrected:

- **Tokenization is `[0-9]{3}[a-z]?`** — `030` and `030a` are distinct. Bridge uses `025b`, `030a`–`030e`, `033a/b`, `053b`, `079b`.
- **No cross-namespace check between plans and specs.** Revision 1 specified one; `docs/plans/` and `docs/specs/` are independent numbering schemes sharing 11 prefixes (001–010, 012) by design.
- **A baseline allowlist is mandatory.** `main` already carries true duplicates: `012-assignments` + `012-monaco-editor-migration`, three `049-python-101-*`, two `057-python-101-*`. Without `scripts/plan-collision-baseline.txt` pre-populated with `012`, `049`, `057`, the guard fails on a clean checkout — Revision 1's stated verification was unachievable. Unlike PowerMarket's (empty) baseline, Bridge's ships non-empty, with a comment naming each entry's reason.

Scripts: `check-plan-uniqueness.sh` (with PowerMarket's `--selftest` mode, which injects a collision and asserts the guard fails), `check-spec-uniqueness.sh`, `check-migration-uniqueness.sh` (`drizzle/`, `NNNN`), `check-decisions-uniqueness.sh` (**restored** — Revision 1 dropped it while Phase 3 adds the numbered doc it guards), `check-conflict-markers.sh`, `pre-merge-guard.sh`, `ci-local.sh`.

`pre-merge-guard.sh --pr <n>` mechanics, per PowerMarket's implementation: `gh pr view` for the branch → temp worktree → `git merge --no-commit --no-ff` → run checkers → **trap-based cleanup on interrupt**. Bridge adds a semantic-break catcher (`go build ./...` + `bunx tsc --noEmit`) in `--pr` mode; PowerMarket uses `cargo build` for this and review flagged its omission as a blocker, since compilation is the only detector for branches that merge cleanly but are semantically incompatible.

`ci-local.sh` runs: `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `cd platform && go test ./... -count=1 -timeout 120s`, **and `scripts/tests/test-guards.sh`** (Revision 1 claimed this ran in `ci-local.sh` but omitted it from the command list — the two statements contradicted).

**Two constraints review forced:**

1. **`ci-local.sh` must not bill API calls.** Because `tests/llm/*.test.ts` run under `bun run test` whenever a provider key is exported, `ci-local.sh` exports `CI=1` and those suites gain a `CI=1` skip guard in Phase 7. Until Phase 7 lands, `ci-local.sh` unsets provider keys for its `bun run test` invocation. Shipping the runner without this makes the pre-merge gate cost money per run.
2. **E2E is not opt-in.** Revision 1 gated Playwright behind `RUN_E2E=1`, which review showed contradicts both "full suite before push" and "local is the gate" — and with `auto_merge=true` it would let autopilot merge with Bridge's riskiest surfaces (realtime sessions, auth flows) unverified. `ci-local.sh` runs E2E by default; `--fast` skips it for inner-loop use and is **not** accepted by `pre-merge-guard.sh`.

**Testing:** `scripts/tests/test-guards.sh` builds throwaway fixture trees and asserts each checker exits non-zero on a bad fixture and zero on a clean one — including a letter-suffix fixture (`030`/`030a` must NOT collide) and a baseline-allowlist fixture. It additionally exercises `pre-merge-guard.sh --pr` against a synthetic local PR-shaped merge and asserts worktree cleanup, since review noted Revision 1 tested only the three leaf checkers and left the most consequential path uncovered.

**Verification:** `bash scripts/tests/test-guards.sh` passes; `bash scripts/pre-merge-guard.sh` passes on this branch; each checker is confirmed to *fail* on its injected-collision selftest.

### Phase 5 — CI workflow

Add `.github/workflows/ci.yml` running lint, type-check, vitest, and `go test`. Bridge has no `.github/` at all today.

This phase exists because the user chose `auto_merge=true`: review's objection was that with no remote CI, the only pre-merge evidence is a script the merging agent runs on itself, and `gh pr checks` — which `AGENTS.md` already tells agents to consult — always returns nothing. An independent gate is what makes auto-merge defensible.

Creating `.github/workflows/` is itself on the hard-safeguard list, so this phase is called out here explicitly as the user-authorized exception.

**Verification:** the workflow runs green on this PR, and `gh pr checks` returns real check rows.

### Phase 6 — Skills

1. Merge `chore/migrate-skills` (single commit `2b0a053`, not on `main`) into this branch. It brings `br-autopilot`, `br-system-review`, `br-test-coverage`, `br-video-keyframes`, already adapted to Bridge's paths, commands, and ports, plus the `.claude/*` + `!.claude/skills/` gitignore change Phase 1 also needs.
2. Update the four for this plan's changes: risk-tiered gates (they encode the old 2-way/3-way), the expanded safeguard list, and `auto_merge=true`.
3. Add three: `br-live-tests`, `br-debug-from-live-failure`, `br-scenario-debug`.
4. `br-system-review` stays **strictly read-only and never kills a process** — ports 3003/8002/4000 carry other work on this machine. This constraint moves into the `AGENTS.md` safeguard list too, not only the skill file.

`br-autopilot` is the one genuinely load-bearing skill (~120 lines of mechanics: auto-merge guard table, stop conditions, pre-auth allowlist, retry caps). Review flagged Phase 5 of Revision 1 as its most underspecified; the mitigation is that `chore/migrate-skills` already wrote it, so this phase reviews and updates rather than drafts.

**Verification:** each skill's frontmatter parses and `name` matches its directory; every command a skill instructs Claude to run resolves in `package.json` or as a real binary; `grep -riE 'cargo|crates/|powermarket|vllm' .claude/skills/` returns nothing.

### Phase 7 — Follow-up plan for the LLM test gap

Draft (do not execute) `docs/plans/092-llm-test-gating.md`: add `CI=1` skip semantics to `tests/llm/*.test.ts` so the pre-merge gate cannot bill API calls, decide the Go-side tier for `platform/internal/llm/` (mock-only today), and remove `ci-local.sh`'s temporary key-unsetting workaround.

Note the rationale shift review forced: PowerMarket's LIVE-LLM-as-source-of-truth rule exists to validate *its own GPU inference fleet* — the product. Bridge calls third-party APIs, so a live test validates the vendor at real cost. Plan 092 should therefore evaluate a recorded-fixture / contract tier, not import PowerMarket's rule unexamined.

**Verification** (Revision 1 gave this phase none): plan 092 exists, has numbered phases, and every file path it names resolves in the repo.

## Rollback

Phases 1–3 are one commit; `git revert` restores the prior governance docs, and `CODEX.md` is recoverable from history. Phases 4–7 are independently revertable. `chore/migrate-skills` is left intact until this plan merges.

## Success metric

Review noted Revision 1 had no way to tell whether the new process beats the old. Over the next three plans, record: gate wall-clock, findings per reviewer, findings that survived to `[FIXED]`, and post-merge defect count — compared against plans 088–090 under the old process. If 4-way gates produce no findings the 2-way tier misses on tiered-low plans, the tiering thresholds move.

## Risks

| Risk | Mitigation |
|---|---|
| `AGENTS.md`/`CLAUDE.md` conflict when `feat/090-adhoc-sessions` merges | Accepted. Resolution is "take 091's version". |
| `auto_merge=true` on a platform with live student data | Expanded safeguards + Phase 5's independent CI gate + E2E-by-default. This is the plan's largest residual risk. |
| Risk-tiering requires a judgment call per plan | `docs/reviewers.md` carries an explicit routing rule; when in doubt, the higher tier applies. |
| Rules written faster than the codebase satisfies them | One such rule (LLM test gating); Phase 7 files it as plan 092, and Phase 4 carries an interim workaround so the gate is safe meanwhile. |

## Plan Review

### Round 1 — 4-way gate (2026-08-05)

Dispatched in parallel. **All three external reviewers returned CHANGES REQUESTED.** The Fable slot failed on quota and was re-run on Opus; that failure is itself recorded as evidence in the Decisions table.

| # | Reviewer | Model | Verdict |
|---|----------|-------|---------|
| 1 | Claude self | Opus 5 | superseded by externals |
| 2 | Codex | `gpt-5.6-sol` | CHANGES REQUESTED |
| 3 | Independent Claude | Fable 5 → **failed: out of usage credits** → re-run on Opus 5 | CHANGES REQUESTED |
| 4 | GLM | `volcengine-plan/glm-5.2` | CHANGES REQUESTED |

**Findings verified against the repo before acting — all confirmed true.**

1. `[FIXED]` `[codex][opus][glm]` Collision guard would fail on clean `main`: real duplicates `012`, `049`, `057` exist; baseline allowlist not ported. → Baseline ported and pre-populated; Phase 4 rewritten.
2. `[FIXED]` `[codex][glm]` Letter-suffix tokenization unspecified; `030`/`030a` would false-collide. → `[0-9]{3}[a-z]?` specified, fixture test added.
3. `[FIXED]` `[opus][glm]` Cross-namespace plans-vs-specs check is wrong; they share 11 prefixes by design. → Check removed, split into two per-namespace checkers.
4. `[FIXED]` `[opus]` `.claude/` gitignored wholesale; Phase 5 would write skills nowhere. Claim that state file was "already versioned" was false. → Phase 1 adds the gitignore negation; Problem §9 added.
5. `[FIXED]` `[opus]` Problem §5 false: `tests/llm/*.test.ts` hit real vendors inside vitest's default include, so `ci-local.sh` would bill per run. → Problem §5 rewritten; Phase 4 constraint 1 and Phase 7 added.
6. `[FIXED]` `[opus]` Safeguards omitted all DB/student-data mutation. → Safeguard list expanded; this was the most serious finding.
7. `[FIXED]` `[opus]` Safeguards omitted auth/tenancy logic. → Added.
8. `[FIXED]` `[opus]` Governance-doc pause is circular w.r.t. `decisions.md`, and its escape hatch has no moment to fire once the approval pause is deleted. → Trigger redefined as "outside declared file scope".
9. `[FIXED]` `[opus]` Prior art ignored: `chore/migrate-skills` already has 4 of 7 skills. → Phase 6 now adopts it.
10. `[FIXED]` `[opus]` No `.github/` exists, so auto-merge has no independent gate. → Phase 5 added.
11. `[FIXED]` `[codex][opus]` E2E opt-in contradicts "local is the gate". → E2E on by default; `--fast` rejected by the guard.
12. `[FIXED]` `[codex][glm]` `test-guards.sh` covered only leaf checkers, not `--pr` or `ci-local`; and `ci-local`'s command list omitted `test-guards.sh` it claimed to run. → Both fixed.
13. `[FIXED]` `[codex]` Phases 1–2 were a non-atomic cutover. → Phases 1–3 now ship as one commit.
14. `[FIXED]` `[codex]` Dropped PowerMarket's judgment-fork and security pauses. → Restored.
15. `[FIXED]` `[glm][opus]` `check-decisions-uniqueness.sh` silently dropped. → Restored.
16. `[FIXED]` `[codex][glm]` "Documentation-only" exemption inaccurate for a plan shipping shell. → Rebased on an untouched-surface boundary.
17. `[FIXED]` `[opus]` Backend-tests→Codex flipped a deliberate Bridge decision with no Bridge rationale. → Reverted; tests stay with Sonnet.
18. `[FIXED]` `[opus]` Uniform 4-way imports PowerMarket's money-movement rationale. → Risk-tiered gates adopted.
19. `[FIXED]` `[glm]` Fable/Opus availability unverified. → Confirmed by the Fable slot's own quota failure; all Claude slots now pin Opus 5.
20. `[FIXED]` `[opus][glm]` No rollback path, no success metric, Phase 6 had no verification. → All three sections added.
21. `[FIXED]` `[opus]` `AGENTS.md` inlining Project Structure / Running the App duplicates existing docs. → Now links instead.
22. `[FIXED]` `[glm]` Phase 1 `CODEX.md` verification ungreppable. → Restated as a concrete grep.
23. `[WONTFIX]` `[opus][glm]` Split into 091a/b/c. → Kept as one plan; phases 4–7 are independently revertable and the atomicity requirement applies only to 1–3. Revisit if round 2 still objects.
24. `[WONTFIX]` `[opus]` `br-video-keyframes` has no stated use in a teaching platform. → It is already written and carries no maintenance cost; dropping it would mean deleting working code from `chore/migrate-skills`.

### Round 2 — pending re-review of this revision.

## Code Review

_Pending._

## Post-Execution Report

_Pending._
