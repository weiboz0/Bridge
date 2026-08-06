# Plan 091 — Port the PowerMarket development process into Bridge

**Branch:** `feat/091-dev-process-port`
**Status:** Revision 4 — all three round-2 reviewers returned CHANGES REQUESTED; 26 findings folded
**Sources:** `../powermarket` (`AGENTS.md`, `docs/`, `scripts/`) and branch `chore/migrate-skills` (four skills already ported from `magicburg`)

## File scope

Round-2 review found the governance-doc safeguard keys on "the plan file's declared file scope" while no plan actually declares one — including this plan. That section is now mandatory in the plan template (Phase 2) and appears here first.

This plan modifies, and only modifies:
`AGENTS.md` · `CLAUDE.md` · `CODEX.md` (delete) · `.gitignore` · `docs/{development-workflow,reviewers,coding-agent,code-review,project-structure}.md` · `docs/bug-investigation-gate.md` (new) · `docs/architecture/decisions.md` (new) · `docs/testing.md` (new) · `docs/plans/09{1,2}-*.md` · `scripts/**` · `.githooks/**` · `.claude/skills/**`

It changes **no** file under `platform/`, `src/`, `e2e/`, `drizzle/`, or `tests/`.

## Problem

Bridge and PowerMarket share an operator and a development philosophy, but Bridge's process has drifted behind. Two rounds of review corrected several of this section's original claims; the corrected list follows.

1. **No autopilot rule.** An orphaned `.claude/br-autopilot-state.json` (plan 090, paused after Phase 3) exists with no autopilot skill on `main`.
2. **Narrower review gates.** 2-way plan review, 3-way code review.
3. **No bug-investigation gate.**
4. **Integration tests are a convention, not a gate.**
5. **LLM tests have no kill switch.** `tests/llm/{providers,guardrails}.test.ts` call real Anthropic / OpenAI / Gemini / DashScope endpoints, gated only by `describe.skipIf(!process.env.*_API_KEY)`, inside vitest's default `include`. They bill real money on any run where a key is present — and `.env` carries seven real keys that **bun auto-loads**, so they are effectively always present. `platform/internal/llm/` (Go) is separately mock-only.
6. **No local pre-merge gate, and no remote one.** No `ci-local.sh`, no collision guard, and no `.github/` at all — so `AGENTS.md`'s existing "check `gh pr checks`" is vacuous.
7. **No cross-cutting decisions doc.**
8. **Stale model pins.** Docs pin Opus 4.7 and GLM 5.1.
9. **Skills are unshareable.** `.gitignore` ignores `.claude/` wholesale — 0 tracked files.
10. **`docs/project-structure.md` is stale.** It documents ports 3003/8002; `.env` sets `NEXTJS_PORT=3101`, `PLATFORM_PORT=8100`. On this machine 3003/8002 host *other* services. Found while verifying a round-2 finding.

## Goal

Bridge's process becomes equivalent to PowerMarket's in rigor, with Bridge's stack substituted and rules re-derived where PowerMarket's rationale does not transfer to a platform holding real student data.

## Decisions

| Fork | Decision | Source |
|---|---|---|
| Scope | Full port, adapted. | User |
| Autopilot | Full lifecycle through squash-merge (`auto_merge=true`), expanded hard-safeguard list, **and a CI gate rebuilt to actually back it** (Phase 5). | User; Phase 5 hardened after round 2 |
| Gate width | Risk-tiered, with the complete routing rule in Phase 2. | User |
| Skills | Adopt `chore/migrate-skills`, add three, un-ignore `.claude/skills/`. | User |
| Claude slots | **Opus 5** in all four: plan-review self, plan-review independent, code-review self, code-review independent. Round-1's Fable pin failed mid-gate on quota. Fable documented as an optional substitute only. | Round-1 gate evidence |
| Implementation models | Codex `gpt-5.6-sol` (backend), **Claude Sonnet 4.6** (frontend + all tests — unchanged from Bridge's current policy). Reviewer slots and implementer slots are distinct; round 2 found the two lists conflated. | Round-2 review |
| GLM model string | `volcengine-plan/glm-5.2`. Its opencode `limit.output` was **4096, which made it fail two round-2 attempts** by exhausting output on reasoning before emitting text; raised to 128000 out-of-repo. | Round-2 incident |
| Codex model | `gpt-5.6-sol`, `model_reasoning_effort = "high"`. | Verified |
| Merge verb | `gh pr merge --squash --auto`. **Never `--admin`** — which stays an always-pause. Round 2 found `br-autopilot` defines auto-merge as admin-merge, contradicting the safeguard list. | Round-2 review |
| Branch home | New branch off `main`. | User |

## Out of scope

- **No integration-tests phase.** Boundary: this plan changes no file under `platform/`, `src/`, `e2e/`, `drizzle/`, or `tests/` (see `## File scope`). Phase 4 ships executable shell and is covered by executable tests.
- PowerMarket's Rust/cargo/sqlx conventions, GPU tiering, seller economics.
- Executing the LLM-test remediation (Phase 7 drafts plan 092).
- Migrating plans 001–090 to the new format.

## Phase ordering

Phases 1–3 are a **single atomic cutover** in one commit. Phases 4 and 7 are independently revertable. **Phases 5 and 6 are coupled** — 5 supplies the required check that makes 6's `auto_merge=true` safe, so they land together and revert together (see `## Rollback`). Phase 6 depends on Phase 4 only for `test-guards.sh`.

### Phase 1 — Governance files + tree hygiene

- Rewrite `AGENTS.md` as canonical. Link to `docs/project-structure.md` and `docs/setup.md`; do not inline them.
- Reduce `CLAUDE.md` to a `@AGENTS.md` pointer. Delete `CODEX.md`.
- `.gitignore`: add `.codex-buddy/` and `*.un~`; delete `..env.un~`. **The `.claude/*` + `!.claude/skills/` change is NOT made here** — it arrives with Phase 6's merge of `chore/migrate-skills`, which already contains it. Round 2 flagged the duplicate hunk as a guaranteed conflict.
- Fix `docs/project-structure.md`'s stale ports (Problem §10).

**Hard safeguards — always pause, regardless of mode:**

- *Secrets*: `.env*` except `.env.example`, `.gh-token`, `.oauth-state-secret.local`, `*credential*` / `*api_key*` / `*token*` / `*secret*`.
- *Database and student data*: any drizzle migration against a non-test database; `db:push` / `db:migrate`; `scripts/seed_*.sql`; content imports. Bridge holds real teacher and student work and has no down-migrations; the prior autopilot run applied migration 0027 to the live `bridge` DB.
  **Enforcement, not honour system.** `drizzle.config.ts:8` reads `process.env.DATABASE_URL`, so "migrate the test DB" is expressed by *setting that variable* — there is no separate test-only path, and an inherited `DATABASE_URL` silently targets production. `ci-local.sh` and the CI job therefore refuse to run any migration unless `DATABASE_URL` matches `_test$` or resolves to the ephemeral CI service container. **Exception, narrowly drawn:** CI's throwaway `postgres:16` container is by definition a test database, so migrating it is not a pause. Round 2 found the unconditional rule and Phase 5's required CI migration step contradicted each other.
- *Scope drift, made detectable*: at gate pass, `br-autopilot` records the approved `## File scope` and the plan file's commit SHA into `.claude/br-autopilot-state.json`; every pre-flight re-derives both and halts on mismatch. Round 2 correctly found that "scope is fixed at gate time" was unenforceable as written — the state schema persisted no snapshot, so a resumed agent could not tell that scope had widened.
- *Auth and tenancy*: `platform/internal/middleware` session verification, org-tenancy scoping, Hocuspocus signed tokens, admin impersonation.
- *Processes and ports*: never kill a process; **never run E2E without a pinned `E2E_BASE_URL`** (see Phase 4). Ports 3003/8002 host other services on this machine.
- *History and remote*: `git push --force`, `reset --hard` on shared history, direct commit to `main`, `git branch -D` with unmerged commits, **`gh pr merge --admin`**, any `gh` write against a PR the agent does not own.
- *Process*: file changes outside `## File scope`; unresolved `[OPEN]` at the review round-cap; a failing `pre-merge-guard.sh` or `ci-local.sh`.
- *Governance docs*: `AGENTS.md`, the `CLAUDE.md` pointer, `docs/{coding-agent,development-workflow,reviewers}.md`, `.githooks/`, `scripts/ci-local.sh` — **unless declared in `## File scope`**, which requires the user to have approved that scope when the plan cleared its gate. Round 2 correctly noted the scope hatch is self-granting; the mitigation is that scope is fixed at gate time and any later widening is itself an always-pause.
- *Judgment forks*: surface genuine scope / architecture / trust-model / breaking-change decisions via `AskUserQuestion`. **Under autopilot this halts the run** — it does not proceed on a default. Round 2 found "then proceed" undefined for unattended mode; a fork is a stop, and the run resumes when answered.

**Verification:** `git check-ignore .codex-buddy` exits 0. For `CODEX.md`: `grep -rl 'CODEX\.md' --include='*.md' . | grep -v '^./docs/plans/'` returns only `docs/reviews/` paths — round 2 showed the previous form matched this plan file's own five references and could never pass.

### Phase 2 — Workflow + reviewer docs

| File | Change |
|---|---|
| `docs/development-workflow.md` | Steps 1–6 rewritten. Step 2's "Get user approval" replaced by the plan-review gate. Adds the named integration-tests phase requirement and a **mandatory `## File scope` section** in every plan. Bridge's single-plan-branch / one-PR-per-plan rules retained. |
| `docs/reviewers.md` | Risk-tiered gate tables + the routing rule below. Pins: Opus 5 (four Claude slots, enumerated), Codex `gpt-5.6-sol`, `volcengine-plan/glm-5.2`. Full-blocking consensus, `max_review_rounds`, source tags. Notes Codex runs `approval_policy = "never"` + `sandbox_mode = "danger-full-access"`, so "read-only" is prompt-enforced only, and that GLM's opencode `limit.output` must stay ≥ 32000 or it fails silently. |
| `docs/coding-agent.md` | Keeps Bridge's existing **domain-based** dispatch term (round 2 flagged Revision 2's drift to "area-based" as unexplained). Tests stay with Sonnet 4.6. Pins refreshed. |
| `docs/code-review.md` | Align status + source tags. |
| `docs/bug-investigation-gate.md` | **New.** 2-way read-only diagnosis (Opus 5 self + Codex). |

**Risk-tier routing rule.** Round 2 judged Revision 2's category list "a partial partition with a tiebreaker, not a routing rule". Replaced with a total function over the plan's declared `## File scope`:

- **Tier A → 4-way.** Any scope touching: `platform/internal/{middleware,store,llm,tools,skills}/**`, `drizzle/**`, `server/hocuspocus.ts`, `scripts/**`, `.githooks/**`, or the governance docs.
- **Tier B → 2-way.** Scope lying *entirely* within `src/**` with no API-contract change, `content/**`, or `docs/**` excluding governance docs.
- **Precedence:** one Tier-A path makes the whole plan Tier A. Plans are never split across tiers.
- **Default:** any path matching neither list is Tier A.
- **Worked example (this plan):** scope includes `scripts/**` and `.githooks/**` → **Tier A, 4-way.** Which is what was actually run — round 2 noted Revision 2's rule would have nominally routed it to 2-way.

**Verification:** a scripted check confirms every cross-reference among the six docs resolves to a real file and heading; no doc still claims an unconditional 2-way or 3-way gate.

### Phase 3 — New reference docs

- **`docs/architecture/decisions.md`** — numbered `§N` entries seeded from Bridge's existing decisions: auth, org/tenant context, drizzle persistence, error shaping, Yjs realtime, LLM backend factory, Go proxy-route boundary.
- **`docs/testing.md`** — per-tier commands and env vars, including the `E2E_BASE_URL` requirement and the LLM kill switch.

**Verification:** every command in `docs/testing.md` is executed once and its exit status recorded in the post-execution report.

### Phase 4 — Guard + CI scripts

Port PowerMarket's implementations rather than re-specifying them.

- **Tokenization `[0-9]{3}[a-z]?`** — `030` and `030a` are distinct.
- **No cross-namespace plans-vs-specs check** — independent numbering schemes sharing 11 prefixes by design.
- **Baseline allowlist mandatory.** `main` carries real duplicates: `012-assignments` + `012-monaco-editor-migration`, three `049-python-101-*`, two `057-python-101-*`. `scripts/plan-collision-baseline.txt` ships **non-empty** with `012`, `049`, `057` and a per-entry reason.

Scripts: `check-plan-uniqueness.sh` (with PowerMarket's `--selftest`), `check-spec-uniqueness.sh`, `check-migration-uniqueness.sh`, `check-decisions-uniqueness.sh`, `check-conflict-markers.sh`, `pre-merge-guard.sh`, `ci-local.sh`.

`pre-merge-guard.sh --pr <n>`: `gh pr view` → temp worktree → `git merge --no-commit --no-ff` → checkers → trap-based cleanup. Semantic-break catcher is **`go vet ./...` + `bunx tsc --noEmit`**, not `go build` — round 2 noted `go build` skips test code, so a test referencing a renamed field passes the guard and fails later.

**Three safety constraints review forced:**

1. **The gate must not bill API calls.** `unset`-ing keys does **not** work: bun auto-loads `.env`, which carries seven real provider keys — verified directly (`unset ANTHROPIC_API_KEY` then `bun --eval` still printed `sk-ant-api03…`). `ci-local.sh` therefore invokes `bun run --env-file=/dev/null test`. The permanent `CI=1` guards are added by **plan 092**, which Phase 7 only drafts — round 2 caught this phase claiming Phase 7 "adds" them, which would let a completion report claim a kill switch that had not shipped.
2. **E2E must never touch a live service or DB.** `e2e/playwright.config.ts` declares no `webServer` and defaults `baseURL` to `http://localhost:3003` — a *foreign* service on this machine — while `e2e/seed.setup.ts` logs in as `eve@demo.edu`, creates classes via `POST /api/classes`, and enrolls users. Revision 2 made E2E mandatory in the gate, which would have pointed mutating seed logic at another service. `ci-local.sh` therefore requires an explicit `E2E_BASE_URL` and a `TEST_DATABASE_URL`-backed stack, and **fails closed** if either is unset rather than falling back to a default.
3. **E2E is not optional.** With constraint 2 satisfied it runs by default; `--fast` skips it for inner-loop use and is rejected by `pre-merge-guard.sh`.

`ci-local.sh` runs: `bun run lint`, `bunx tsc --noEmit`, `bun run --env-file=/dev/null test`, `cd platform && go test ./... -count=1 -timeout 120s`, `scripts/tests/test-guards.sh`, and E2E.

**Testing:** `scripts/tests/test-guards.sh` builds throwaway fixture trees asserting each checker exits non-zero on a bad fixture and zero on a clean one — including a letter-suffix fixture (`030`/`030a` must NOT collide) and a baseline-allowlist fixture. It also exercises `pre-merge-guard.sh --pr` against a synthetic local PR-shaped merge and asserts worktree cleanup.

**Verification:** `test-guards.sh` passes; `pre-merge-guard.sh` passes on this branch; each checker fails on its injected-collision selftest; `ci-local.sh` is confirmed to make zero outbound API calls.

### Phase 5 — Local CI (revised: no cloud CI)

**Superseded by user decision.** The original phase added `.github/workflows/ci.yml` with a Postgres service container and a branch-protection ruleset. Bridge now runs **no cloud CI at all** — `scripts/ci-local.sh` is the only gate. The workflow was written, committed (`1cb6ca9`), and then removed.

That removes the independent remote check which was the entire justification for `auto_merge=true`, so the evidence chain is rebuilt locally:

1. **`.githooks/pre-push`** runs the gate before anything leaves the machine. Installed per clone by `bash scripts/install-hooks.sh`, which sets `core.hooksPath` so the hook is version-controlled rather than hidden in an untracked `.git/hooks`.
2. **Gate attestation.** A passing `ci-local.sh` writes `.claude/ci-local-attestation.json` recording the commit, branch, `tree_dirty`, and `fast`. A *failing* run deletes it, so a stale pass cannot vouch for a broken tree.
3. **`br-autopilot` refuses to merge** unless the attestation names the PR HEAD exactly, with `fast: false` and `tree_dirty: false`. "The branch passed recently" says nothing about the commit being merged.

**Honest limitation.** This is weaker than a required cloud check: the agent that ran the gate is the agent asking to merge. It defends against forgetting, not against a determined bypass. `--admin` remains an always-pause; `--no-verify` is for pushes where the gate was already run by hand.

**Verification:** hooks install and `core.hooksPath` is set; the hook exits 0 without running the gate on a branch-delete push; a passing run writes an attestation naming the correct SHA; `--fast` and dirty-tree runs are correctly marked insufficient for merge. All confirmed.

### Phase 6 — Skills

1. Merge `chore/migrate-skills` (commit `2b0a053`), bringing `br-autopilot`, `br-system-review`, `br-test-coverage`, `br-video-keyframes` — already adapted to Bridge's paths and commands — plus the `.claude/*` + `!.claude/skills/` gitignore change.
2. Update the four for: risk-tiered gates, the expanded safeguard list, and the `--squash --auto` merge verb (the skill currently implies `--admin`). Three further corrections round 2 found in the imported `br-autopilot`:
   - **Scope-section migration.** The skill gates scope on `"Files of interest" / "Phase scope"` in six places (`SKILL.md:47,84,96,124,141,145`) and never on `## File scope`. Until that is migrated, new-format plans cannot be scope-gated at all — the Phase 1 safeguard would be inert. Migrate the wording *and* add a behaviour test that a new-format plan is correctly gated.
   - **Scope snapshot.** Persist the approved scope + plan-file SHA into the state file at gate pass; compare on every pre-flight (see Phase 1).
   - **Stale pin.** `SKILL.md:145` still says "on Opus 4.7".
   - **`auto_merge=true` is enabled only after Phase 5's required check exists**, and the skill verifies at runtime that the PR has a required, non-advisory check before merging. Round 2 found that Phase 5 being "independently revertable" while Phase 6 enables auto-merge means reverting Phase 5 alone would leave an auto-merge-capable agent with only an advisory signal. A runtime check makes the coupling self-enforcing rather than dependent on revert discipline.
3. Add three, specified rather than merely named (round 2 flagged them as unspecified):
   - **`br-live-tests`** — runs the gated LLM tier and E2E. Inputs: tier selector, explicit `E2E_BASE_URL`. Refuses to run if `E2E_BASE_URL` is unset or resolves to 3003/8002. Warns on cost before any provider-key-backed run.
   - **`br-debug-from-live-failure`** — takes one failing test name, collects test source, service logs, and recent git touches, and hands the bundle to the 2-way bug-investigation gate. Read-only; proposes no fix.
   - **`br-scenario-debug`** — picks one failing scenario and loops run → diagnose → fix → re-run under the same retry caps as `br-autopilot`, stopping on cap or on any hard safeguard. **Requires a plan ID and its `## File scope` as input** and refuses to edit outside it; round 2 noted a repeatedly-fixing agent with only a failing test name as input has nothing to bind its edits to.
4. `br-system-review` stays strictly read-only and never kills a process.

**Verification:** each skill's frontmatter parses and `name` matches its directory; every command a skill runs resolves in `package.json` or as a real binary; `grep -riE 'cargo|crates/|powermarket|vllm' .claude/skills/` returns nothing; `git ls-files .claude/skills | wc -l` > 0.

### Phase 7 — Follow-up plan for the LLM test gap

Draft (do not execute) `docs/plans/092-llm-test-gating.md`: add `CI=1` guards to `tests/llm/*.test.ts`, decide the Go-side tier for `platform/internal/llm/`, and retire `ci-local.sh`'s `--env-file=/dev/null` workaround once the guards land.

PowerMarket's LIVE-LLM-as-source-of-truth rule exists to validate *its own* GPU fleet — the product. Bridge calls third-party APIs, so a live test validates the vendor at real cost; plan 092 should evaluate a recorded-fixture / contract tier rather than import the rule unexamined.

**Verification:** plan 092 exists, has numbered phases and a `## File scope`, and every path it names resolves.

## Rollback

Phases 1–3 are one commit; `git revert` restores the prior governance docs and `CODEX.md` is recoverable from history. Phases 4 and 7 are independently revertable.

**Phases 5 and 6 are NOT independently revertable** and must be reverted together or in the order 6-then-5. Round 2 found the previous wording unsound: Phase 6 turns on `auto_merge=true` while Phase 5 supplies the required check that makes it safe, so reverting Phase 5 alone — including deleting its ruleset via `gh api -X DELETE` — would leave an auto-merge-capable agent gated by nothing but an advisory signal. The runtime required-check assertion added to `br-autopilot` (Phase 6 step 2) is the backstop if this ordering is violated anyway.

`chore/migrate-skills` stays intact until this plan merges.

## Success metric

Recorded in `docs/reviews/091-process-port-metrics.md` (round 2 noted the metric had no home). Over the next three plans: gate wall-clock, findings per reviewer, findings surviving to `[FIXED]`, and post-merge defect count — against plans 088–090 under the old process. If Tier-A gates surface nothing the 2-way tier misses, the tier thresholds move.

## Risks

| Risk | Mitigation |
|---|---|
| `AGENTS.md`/`CLAUDE.md` conflict when `feat/090-adhoc-sessions` merges | Accepted; resolution is "take 091's version". |
| `auto_merge=true` on a platform with live student data | Phase 5's required CI check, E2E fail-closed on `E2E_BASE_URL`, expanded safeguards, `--admin` forbidden. Largest residual risk. |
| The safeguard scope-hatch is self-granting | Scope is fixed at gate time; widening it later is itself an always-pause. |
| Rules written faster than the codebase satisfies them | One such rule; Phase 7 files plan 092, Phase 4 carries a working interim guard. |

## Plan Review

### Round 1 — 4-way gate (2026-08-05)

All three externals: **CHANGES REQUESTED**. Fable slot failed on quota, re-run on Opus. 22 findings `[FIXED]`, 2 `[WONTFIX]` — full list preserved in commit `b1cbb57`.

### Round 2 — 4-way gate (2026-08-05)

| # | Reviewer | Model | Verdict |
|---|----------|-------|---------|
| 1 | Claude self | Opus 5 | superseded by externals |
| 2 | Codex | `gpt-5.6-sol` | CHANGES REQUESTED (first run died silently at 19 min; re-dispatched) |
| 3 | Independent Claude | Opus 5 | CHANGES REQUESTED |
| 4 | GLM | `volcengine-plan/glm-5.2` | CHANGES REQUESTED (after an output-cap failure, since fixed) |

Round-1 findings re-audited by the reviewers who raised them: Opus 8 RESOLVED / 4 PARTIAL; GLM 10 RESOLVED / 2 PARTIAL / 1 withdrawn. All PARTIALs are addressed below.

1. `[FIXED]` `[opus]` **E2E mandated in the gate would fire mutating seed logic at a foreign service** — `baseURL` defaults to 3003 with no `webServer`; `seed.setup.ts` creates classes and enrolls users. Verified. → Phase 4 constraint 2: fail closed on unset `E2E_BASE_URL`; Phase 5 runs E2E against a CI-owned stack.
2. `[FIXED]` `[opus]` **The key-unset workaround is inert** — bun auto-loads `.env`'s seven keys; verified directly. → `--env-file=/dev/null`.
3. `[FIXED]` `[glm]` **`ci.yml` was a strict subset of `ci-local.sh`**, so auto-merge fired on a signal that skipped every guard. → `ci.yml` now invokes `ci-local.sh`.
4. `[FIXED]` `[opus]` Phase 5 could not go green — needed Postgres, `TEST_DATABASE_URL`, migrations, `HOCUSPOCUS_TOKEN_SECRET`. → Service container + secrets specified.
5. `[FIXED]` `[opus]` No required-checks ruleset, so `--auto` merges on an advisory signal. → Ruleset added.
6. `[FIXED]` `[opus]` `--admin` on the always-pause list contradicted `br-autopilot`'s admin-merge definition. → `--squash --auto`; Phase 6 step 2 updates the skill.
7. `[FIXED]` `[opus]` Safeguards self-disabling via declared scope; this plan had no scope section. → `## File scope` added and made mandatory.
8. `[FIXED]` `[glm]` `CODEX.md` grep still unachievable — the plan file's own references match it. → Excludes `docs/plans/`.
9. `[FIXED]` `[glm]` `go build` skips test code. → `go vet ./...`.
10. `[FIXED]` `[glm]` Risk-tier rule not applicable without guesswork. → Total function over `## File scope`, with precedence, fail-safe default, and a worked example.
11. `[FIXED]` `[glm]` Reviewer pins conflated with implementer pins; Sonnet version unstated. → Two separate rows; Sonnet 4.6 named.
12. `[FIXED]` `[glm]` Judgment-fork behavior undefined under unattended autopilot. → A fork halts the run.
13. `[FIXED]` `[glm]` Three new skills named but unspecified. → Specified in Phase 6.
14. `[FIXED]` `[opus][glm]` Duplicate `.gitignore` hunk would conflict with the Phase 6 merge. → Phase 1 no longer touches it.
15. `[FIXED]` `[glm]` "Area-based" vs Bridge's "domain-based" drift. → Keeps "domain-based".
16. `[FIXED]` `[glm]` Success metric had no recording location. → `docs/reviews/091-process-port-metrics.md`.
17. `[FIXED]` — Found while verifying #1: `docs/project-structure.md` documents stale ports. → Phase 1.
18. `[WONTFIX]` `[opus][glm]` Split into 091a/b/c. → One plan; 4 and 7 independently revertable. Opus rated its own finding "sound with caveat" and did not re-raise it as a blocker once Phase 5 and 6 were specified.

**Codex round-2 findings (Revision 3), folded into Revision 4.** All four blockers verified against the repo before acting; all confirmed.

19. `[FIXED]` `[codex]` **`drizzle.config.ts:8` reads `DATABASE_URL`, never `TEST_DATABASE_URL`** — Phase 5's migration step could not have gone green, and an inherited `DATABASE_URL` would silently target production. → Phase 5 sets `DATABASE_URL` to the container; `ci-local.sh` and CI refuse to migrate unless it matches `_test$` or the ephemeral container. This also converts the database safeguard from advisory to enforced.
20. `[FIXED]` `[codex]` **`br-autopilot` gates scope on `"Files of interest" / "Phase scope"`** (`SKILL.md:47,84,96,124,141,145`), never `## File scope` — so Revision 3's scope safeguard was inert in the skill meant to enforce it. → Phase 6 step 2 migrates the wording and adds a behaviour test.
21. `[FIXED]` `[codex]` **"Scope is fixed at gate time" had no persistence mechanism** — the state schema stored no snapshot, so a resumed agent could not detect widening. → Approved scope + plan-file SHA recorded at gate pass, compared every pre-flight.
22. `[FIXED]` `[codex]` **Phase 5/6 revert coupling** — Phase 6 enables auto-merge while Phase 5 supplies its required check, yet Phase 5 was called independently revertable. → Rollback section corrected, plus a runtime required-check assertion in `br-autopilot` as the backstop.
23. `[FIXED]` `[codex]` `db:migrate` as an unconditional always-pause contradicted Phase 5's required unattended CI migration. → Exception narrowly drawn to the ephemeral CI container, tied to the `DATABASE_URL` guard.
24. `[FIXED]` `[codex]` Phase 4 claimed "Phase 7 adds `CI=1` guards" while Phase 7 only drafts plan 092 — a completion report could have claimed a kill switch that never shipped. → Reworded.
25. `[FIXED]` `[codex]` `br-scenario-debug` could fix repeatedly with no plan or scope binding. → Requires a plan ID + `## File scope`.
26. `[FIXED]` — Found while verifying #20: `br-autopilot` `SKILL.md:145` still pins "Opus 4.7". → Phase 6 step 2.

### Round 3 — pending re-review of Revision 4.

## Code Review

_Pending._

## Post-Execution Report

All seven phases implemented. Two follow-up plans drafted. Nothing pushed.

### Shipped

| Phase | Result |
|---|---|
| 1–3 (atomic) | `AGENTS.md` canonical with enumerated hard safeguards; `CLAUDE.md` reduced to a pointer; `CODEX.md` deleted; workflow/reviewer/dispatch docs rewritten; new `bug-investigation-gate.md`, `architecture/decisions.md` (9 entries), `testing.md`; `project-structure.md` stale ports corrected. |
| 4 | Seven guard scripts + shared `lib/uniqueness.sh` + non-empty `plan-collision-baseline.txt` + `ci-local.sh` + `tests/test-guards.sh` (20 assertions). |
| 5 | **Revised mid-flight**: cloud CI dropped by user decision. `.githooks/pre-push` + a commit-pinned gate attestation replace it as the merge evidence. |
| 6 | `chore/migrate-skills` merged (4 skills), all updated for the new gates, 3 new skills written. 7 tracked under `.claude/skills/`. |
| 7 | Plans 092 (LLM test gating) and 093 (lint debt) drafted. |

### Deviations from plan

1. **Phase 4 merged into the 1–3 atomic commit.** The new governance docs instruct agents to run `ci-local.sh` and `pre-merge-guard.sh`; shipping the rules a commit before the scripts would have recreated the exact dangling-reference problem the atomicity requirement exists to prevent.
2. **Scope widened twice, both user-authorized after the safeguard paused.** First to `src/app/(portal)/teacher/chapters/new/page.tsx`, `tests/unit/identity-assert.test.ts`, `scripts/dev.ts` (8 pre-existing `tsc` errors); then to `tests/helpers.ts` (the database footgun below). The safeguard fired correctly both times — on its own author, mid-execution.
3. **Lint handled by ratchet, not by fixing.** 145 pre-existing violations across 83 files. `check-lint-baseline.sh` fails on new violations only. Plan 093 repays it.
4. **CI job split.** `gate` runs `ci-local.sh --fast`; `e2e` runs Playwright with a booted stack. Together they equal a full run. Both must be required in branch protection or the split becomes a gap.

### What the work uncovered

Three defects found by building the gate rather than by reviewing the plan:

1. **`bun run test` truncated the development database.** `.env` sets `DATABASE_URL` to `bridge`; bun auto-loads `.env`; `tests/helpers.ts` used `process.env.DATABASE_URL || <bridge_test fallback>`, and a fallback only applies when the variable is absent. `tests/setup.ts` then deleted every table in `afterEach`. Documentation claimed the suite used `bridge_test`. Fixed at source — `tests/helpers.ts` now hard-refuses any database not ending in `_test`.
2. **`main` did not pass `tsc --noEmit`.** 8 errors, reproduced on `main` before touching anything. Fixed.
3. **`docs/project-structure.md` documented the wrong ports** (3003/8002 vs `.env`'s 3101/8100), on a machine where 3003 hosts an unrelated service — the same wrong assumption baked into Playwright's `baseURL` default.

Two of this plan's own earlier fixes were themselves wrong, caught before landing:

- `--env-file=/dev/null` blocked API billing but stripped `DATABASE_URL`, breaking 3 tests. The obvious repair — letting `.env` load — would have pointed all 848 tests at live data.
- The lint ratchet's first version filtered to `git ls-files`, silently ignoring violations in new untracked files. Its own selftest caught it.

### Verification

`bash scripts/ci-local.sh --fast` → **GATE PASSED**: lint ratchet, type-check, five collision guards, 20/20 guard self-tests, 837 vitest tests, `go test`. Each guard was separately observed *failing* on an injected collision. The DB guard was confirmed to reject `bridge` and accept `bridge_test`.

### Known limitations

1. **The local gate is the only gate, and it is self-attested.** The agent that runs `ci-local.sh` is the agent asking to merge, so the attestation defends against forgetting rather than against bypass. The `pre-push` hook has been exercised only on its branch-delete fast path; its full-gate path has never run for real, because nothing has been pushed.
2. **`auto_merge` remains `false` and must stay so** until Phase 5's CI is proven green and a branch-protection ruleset marks both jobs required. The ruleset was not created — it is a remote write on an unpushed branch. `br-autopilot` now asserts a required check exists at runtime, so the coupling does not depend on anyone remembering this.
3. **E2E has never run in this environment**, deliberately — no pinned `E2E_BASE_URL` and the fixtures mutate data.
4. **Revision 4 of this plan was never reviewed.** Rounds 1 and 2 both found blockers, including rounds where a previous round's fix was broken. The base rate suggests Revision 4 is not clean.
5. **Historical data loss from finding #1 is unassessed.** Whether past `bun run test` invocations cost real data depends on how tests have been run; not determinable from here.
