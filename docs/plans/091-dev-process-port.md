# Plan 091 — Port the PowerMarket development process into Bridge

**Branch:** `feat/091-dev-process-port`
**Status:** Draft — awaiting plan-review gate
**Source:** `../powermarket` (`AGENTS.md`, `docs/development-workflow.md`, `docs/coding-agent-dispatch.md`, `docs/bug-investigation-gate.md`, `scripts/`, `.claude/skills/`)

## Problem

Bridge and PowerMarket share an operator and a development philosophy,
but Bridge's process has drifted behind.
PowerMarket has since hardened its cadence in ways Bridge has not adopted:

1. **No autopilot rule.** Bridge has an orphaned `.claude/br-autopilot-state.json` (plan 090, paused after Phase 3) but no autopilot skill and no rule describing the mode. The state file references mechanics that exist nowhere in the repo.
2. **Narrower review gates.** Bridge runs 2-way plan review (self + Codex) and 3-way code review (self + Codex + GLM). PowerMarket runs 4-way on both, adding an independent fresh-context Claude reviewer, and promotes GLM into plan review.
3. **No bug-investigation gate.** Bridge has no read-only diagnosis pattern; every bug goes straight to a fix.
4. **Integration tests are a convention, not a gate.** Bridge's rule ("every new Go API endpoint needs an integration test") lives in prose. PowerMarket requires a *named integration-tests phase* in the plan that reviewers must reject the plan for omitting.
5. **LLM-touching code is verified by mocks only.** Bridge has a real LLM surface — `platform/internal/llm/` (agent loop, four backends), `platform/internal/tools/registry.go`, `platform/internal/skills/tutor.go`, `platform/internal/handlers/{ai,chapter_ai}.go` — and every test against it uses an in-file mock. There is no `CI=1` gating and no LIVE tier. PowerMarket treats LIVE-LLM tests as the source of truth for exactly this code shape.
6. **No local pre-merge gate.** Bridge has no `ci-local.sh` and no collision guard. Plan/spec/migration numbers collide across parallel sessions; this branch hit it immediately (plan `090` and spec `011` exist only on `feat/090-adhoc-sessions`, invisible from `main`).
7. **No cross-cutting decisions doc.** Architectural rules are spread across plan files and specs with no single source of truth.
8. **Stale model pins.** Docs pin Opus 4.7 and GLM 5.1; the current roster is Opus 5 / Fable 5 / GLM 5.2.

## Goal

Bridge's process becomes equivalent to PowerMarket's,
with Bridge's stack (Go, Next.js, bun, drizzle, Playwright) substituted for PowerMarket's (Rust, cargo, sqlx),
and Bridge-specific rules that PowerMarket lacks (one-PR-per-plan, `feat/NNN-*` branch naming, letter-suffixed sub-plans) preserved.

## Decisions taken before drafting

| Fork | Decision |
|---|---|
| Scope | Full port, adapted. |
| Claude model slots | Mirror PowerMarket's split — plan review on Fable 5 (both Claude slots), code review on Opus 5 (both Claude slots), Opus fallback when Fable is unavailable. |
| GLM model string | `volcengine-plan/glm-5.2`. PowerMarket's `opencode-go/glm-5.2` names a provider that does not exist in `~/.config/opencode/opencode.json` on this machine; `volcengine-plan` is the only provider carrying GLM. |
| Branch home | New branch off `main`, not off `feat/090-adhoc-sessions`. |
| Orphaned tree changes | Commit the `CODEX.md` deletion, gitignore `.codex-buddy/` and `*.un~`, delete `..env.un~`. |
| Backend test authorship | Adopt PowerMarket's split — backend tests to Codex (independent second model), frontend tests to Sonnet. Bridge currently sends all tests to Sonnet. |
| Spec vs plan | Straight to plan. The design is concrete (files, phases, verification decided), which Bridge's own `AGENTS.md` says is the signal to skip the spec. |

## Out of scope

- **No integration-tests phase** in the PowerMarket sense: this plan ships documentation, shell scripts, and skill files. It touches no API surface, no request path, no persistence, and no auth. The exemption is claimed under the "documentation-only" category the new rule itself defines. The scripts *are* covered — see Phase 4's test requirement, which is a genuine executable test, not a waiver.
- PowerMarket's Rust/cargo/sqlx conventions, vLLM and GPU tiering, `config.toml` conventions, seller-economics content.
- Executing the LIVE-LLM test work. Phase 6 *drafts* plan 092; it does not run it.
- Migrating existing plan files (001–090) to the new review format. New plans only.

## Phases

### Phase 1 — Governance files + tree hygiene

- Rewrite `AGENTS.md` as the canonical agent-agnostic instruction set, adopting PowerMarket's section order: CRITICAL RULES → Project Structure → Architecture Decisions → Running the App → Coding Conventions → Testing → Documentation → Git → Plans → Development Workflow → Code-review gate → Bug-investigation gate → Multi-Agent Coordination.
- Reduce `CLAUDE.md` to a thin `@AGENTS.md` pointer (reproduces `fc7900a`, which exists only on the 090 branch).
- Delete `CODEX.md` — `AGENTS.md` supersedes it; its only inbound reference is a historical review doc, which is left as a historical record.
- `.gitignore`: add `.codex-buddy/` and `*.un~`. Delete `..env.un~`.

New CRITICAL RULES content:
- **Autopilot is the default operating mode** for design, plans, and bug fixes — full lifecycle through squash-merge without per-step approval.
- **Hard safeguards** (always pause, regardless of mode): the secrets surface (`.env*` except `.env.example`, `.gh-token`, `.oauth-state-secret.local`, `*credential*`/`*api_key*`/`*token*`/`*secret*`); `git push --force` / `reset --hard` on shared history; a direct commit to `main`; edits to the governance docs themselves (`AGENTS.md`, the `CLAUDE.md` pointer, `docs/coding-agent.md`, `docs/development-workflow.md`, `docs/reviewers.md`, `docs/architecture/decisions.md`, `.github/workflows/`) except when the user explicitly asks; plan-scope expansion beyond the plan's phases; unresolved `[OPEN]` findings at the review round-cap; a failing `pre-merge-guard.sh` or `ci-local.sh`.
- Area-based dispatch, 4-way plan gate, 4-way code gate, post-execution report, full suite before push, local-is-the-gate.

**Verification:** `grep` confirms no doc references `CODEX.md` as live guidance; `git check-ignore .codex-buddy` exits 0.

### Phase 2 — Workflow + reviewer docs

| File | Change |
|---|---|
| `docs/development-workflow.md` | Steps 1–6 rewritten to PowerMarket's version. Step 2's "Get user approval" is **replaced** by the 4-way plan-review gate (a clean gate IS the approval). Step 2 gains the named integration-tests phase requirement. Step 4 gains "confirm the integration-tests phase shipped its named acceptance criteria". Step 5 becomes 4-way. Bridge's single-plan-branch / one-PR-per-plan rules and the single-PR exception are **retained verbatim** — PowerMarket has no equivalent and they are load-bearing here. |
| `docs/reviewers.md` | 2-way → 4-way plan gate; 3-way → 4-way code gate. Model pins: Fable 5 (plan Claude slots), Opus 5 (code Claude slots), Codex, `volcengine-plan/glm-5.2`. Adds full-blocking consensus, `max_review_rounds`, source tags `[claude-self]` / `[codex]` / `[fable]` / `[glm]`, and the reviewer duty to reject a plan missing its integration-tests phase. |
| `docs/coding-agent.md` | Area-based (not complexity-based) dispatch table; backend tests → Codex; pins refreshed to Opus 5; adds the promotion-mid-task and parallelism guidance. |
| `docs/code-review.md` | Align status tags (`[OPEN]`/`[FIXED]`/`[WONTFIX]`) and add source tags. |
| `docs/bug-investigation-gate.md` | **New.** 2-way read-only diagnosis (Claude self on Opus 5 + Codex), the "DO NOT WRITE CODE" prompt contract, consensus/unique-insight/contradiction cross-check, and the skip/don't-skip lists. |

**Verification:** every cross-reference between the five docs resolves to a real file and a real section heading; no doc still claims a 2-way or 3-way gate.

### Phase 3 — New reference docs

- **`docs/architecture/decisions.md`** — seeded with Bridge's *existing* cross-cutting decisions extracted from the codebase and prior specs, not an empty stub: auth (NextAuth + Go session verification), org/tenant context, persistence (drizzle migrations, `NNNN_name.sql` prefixes), error shaping, realtime (Yjs/Hocuspocus), LLM backend factory, and the Go proxy-route boundary. Each entry gets a number, a decision, and a rationale.
- **`docs/testing.md`** — the per-tier command and env-var owner the workflow doc delegates to: vitest (`bun run test`, `bridge_test` DB), Go (`go test ./... -count=1 -timeout 120s`, `TEST_DATABASE_URL`), E2E (`bun run test:e2e`, all three services), and the new LIVE-LLM tier with its `CI=1` semantics.

**Verification:** every command in `docs/testing.md` is executed once and its exit status recorded in the plan's post-execution report.

### Phase 4 — Guard + CI scripts

- `scripts/check-plan-uniqueness.sh` — duplicate `NNN` prefixes across `docs/plans/` **and** `docs/specs/` (both collide in practice; spec `011` is the live example).
- `scripts/check-migration-uniqueness.sh` — duplicate `NNNN` prefixes in `drizzle/`.
- `scripts/check-conflict-markers.sh` — unresolved merge markers in tracked files.
- `scripts/pre-merge-guard.sh` — runs all three; `--pr <number>` fetches the PR and checks the *simulated post-merge* state, which is the only mode that catches a cross-branch collision like 090/011.
- `scripts/ci-local.sh` — the authoritative local gate: `bun run lint`, `bunx tsc --noEmit`, `bun run test`, `cd platform && go test ./... -count=1 -timeout 120s`. E2E is opt-in via `RUN_E2E=1` because it needs all three services up.

**Testing (this phase's real test requirement):** `scripts/tests/test-guards.sh` builds a throwaway fixture tree containing a known-colliding plan pair, a colliding migration pair, and a file with conflict markers, then asserts each checker exits non-zero on the bad fixture and zero on a clean one. This runs in `ci-local.sh`. A guard script that has never been shown to fail on a real collision is not a guard.

**Verification:** `bash scripts/tests/test-guards.sh` passes; `bash scripts/pre-merge-guard.sh` passes on this branch; the guard is confirmed to *fail* when pointed at a synthetic 090-vs-091 collision.

### Phase 5 — Skills

Port seven skills to `.claude/skills/`, renaming `pm-` → `br-`:

| Skill | Adaptation |
|---|---|
| `br-autopilot` | 4-way gates, bun/go commands, `auto_merge=true` default, Bridge's hard-safeguard list. Reuses the existing `.claude/br-autopilot-state.json` schema (already on disk, already versioned). |
| `br-system-review` | Next.js 3003 / Go platform 8002 / Hocuspocus 4000, Postgres `bridge` + `bridge_test`, drizzle migration status. **Strictly read-only — never kills a process**, since those ports carry other work on this machine. |
| `br-test-coverage` | Diff-scoped gap audit against Bridge's rules: every Go endpoint needs an integration test; every LLM-touching change needs a LIVE test. |
| `br-live-tests` | Bridge's LIVE-LLM tier + E2E, with cost warning and the `CI=1` contract. |
| `br-debug-from-live-failure` | Evidence collection (test source, service logs, recent git touches) feeding the 2-way bug-investigation gate. |
| `br-scenario-debug` | Pick one failing E2E/LIVE scenario, loop run→diagnose→fix→re-run until green or a cap trips. |
| `br-video-keyframes` | Ported near-verbatim; it is stack-agnostic. |

**Verification:** every skill's YAML frontmatter parses, `name` matches its directory, and every command the skill instructs Claude to run exists in `package.json` or is a real binary.

### Phase 6 — Follow-up plan for the LIVE-LLM gap

Draft (do not execute) `docs/plans/092-live-llm-test-tier.md`:
add `CI=1` skip semantics to the existing mock LLM tests in `platform/internal/llm/` and `platform/internal/handlers/chapter_ai_test.go`,
and land the first LIVE agent-loop integration test.

This exists because Phase 1 introduces a rule the codebase does not yet satisfy,
and Bridge's own "never defer without a follow-up plan" rule forbids shipping that as a TODO.

## Risks

| Risk | Mitigation |
|---|---|
| `AGENTS.md`/`CLAUDE.md` conflict when `feat/090-adhoc-sessions` merges | Expected and accepted — chosen deliberately over branching off 090. Resolution is "take 091's version"; noted here so the next session doesn't re-litigate it. |
| Autopilot-as-default is a large behavioral change | The hard-safeguard list is the backstop, and it is enumerated in `AGENTS.md` rather than left to judgment. |
| 4-way gates cost more per plan | Accepted by the scope decision. |
| Rules written faster than the codebase can satisfy them | Only one such rule exists (LIVE-LLM); Phase 6 files it as a real numbered plan. |

## Plan Review

_Pending — 4-way gate per `docs/reviewers.md`. Under the process this plan replaces, the gate for this plan is the current 2-way (self + Codex); the new 4-way applies to plans drafted after it merges._

## Code Review

_Pending._

## Post-Execution Report

_Pending._
