# Plan 092 — Gate the live-LLM test tier

**Status:** Drafted, not started. Created by plan 091 Phase 7.
**Risk tier:** A (`tests/**` plus `scripts/**` — see `docs/reviewers.md`)

## File scope

`tests/llm/providers.test.ts` · `tests/llm/guardrails.test.ts` · `scripts/ci-local.sh` ·
`docs/testing.md` · `platform/internal/llm/*_test.go` · this plan file.

## Problem

`tests/llm/providers.test.ts` and `tests/llm/guardrails.test.ts` call real Anthropic,
OpenAI, Gemini, DashScope, and OpenRouter endpoints.
They are gated only by `describe.skipIf(!process.env.<PROVIDER>_API_KEY)`,
and they sit inside vitest's default `include`, so they run as part of `bun run test`.

`.env` carries seven real provider keys and bun auto-loads it,
so the keys are effectively always present and the gate is effectively always open.
`unset` does not close it — bun re-reads the value from the file.

Plan 091 shipped a workaround: `scripts/ci-local.sh` blanks the five keys with empty-string exports.
That protects the gate but not a developer or agent typing `bun run test` directly.
The guard belongs in the test files, where every invocation sees it.

Separately, `platform/internal/llm/` (Go) is mock-only —
no live tier and no `CI` gating anywhere under `platform/`.

## Goal

Cost exposure becomes explicit and opt-in at the test-file level,
and the Go LLM surface gets a deliberate verification story rather than an accidental one.

## Phases

### Phase 1 — Guard the TypeScript live tier

Add an explicit opt-in guard to both files in `tests/llm/`,
so the tier runs only when the caller asks for it — not merely because a key happens to be in the environment:

```ts
const LIVE = process.env.RUN_LIVE_LLM_TESTS === "1";
describe.skipIf(!LIVE || !testClient)("…", () => { … })
```

Key presence stops being sufficient. This is the whole point:
presence is ambient, an explicit flag is a decision.

**Verification:** `bun run test` with all keys present in `.env` performs zero outbound provider calls.
Confirm by network counter or by asserting the suites report as skipped, not by inspection.

### Phase 2 — Retire the ci-local.sh workaround

Remove the five empty-string key exports from `scripts/ci-local.sh` once Phase 1 lands,
keeping the `DATABASE_URL` pin, which guards a different hazard.
Update the comment block so it explains what still protects what.

**Verification:** `bash scripts/ci-local.sh --fast` still makes zero provider calls with the exports removed.

### Phase 3 — Decide the Go-side tier

`platform/internal/llm/` has four backends, an agent loop, a tool registry, and skills — all mock-tested.

Decide, and record in `docs/architecture/decisions.md §7`, whether that is sufficient.
The question is genuinely open and should not be answered by importing another project's rule:

- PowerMarket treats live-LLM tests as the source of truth because the model it calls **is its own product**.
- Bridge calls **third-party APIs**. A live test there verifies the vendor, at real cost, on someone else's uptime.

A recorded-fixture or contract tier may serve Bridge better than a live one —
it catches request-shape drift without paying per run.
Evaluate that before committing to a live tier.

**Verification:** a decision is written into `decisions.md §7` with its rationale,
and whichever tier is chosen has at least one passing test.

## Out of scope

- Changing which providers Bridge supports.
- The `platform/internal/llm/` production code itself.
- **No integration-tests phase** under the `AGENTS.md` rule: this plan touches no API surface,
  no realtime protocol, and no auth/persistence plumbing. It changes test gating and one docs entry.

## Plan Review

_Pending — Tier A, 4-way._
