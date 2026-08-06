---
name: br-live-tests
description: Run Bridge's cost-bearing or stack-dependent test tiers — the live LLM provider tests and the Playwright E2E suite. Handles the two ways these tiers go wrong on this machine (billing real provider calls, and pointing mutating E2E fixtures at a foreign service or the real database), warns about cost before spending anything, and summarises results. Use when the user asks to run E2E, run the live LLM tests, or verify against real providers.
---

# br-live-tests

Runs the two Bridge test tiers that `scripts/ci-local.sh --fast` deliberately skips,
because both can do real-world damage if invoked carelessly.

**Read the hazards before running anything.** They are not theoretical; both were
found in the codebase, not imagined.

## Hazard 1 — the live LLM tier bills real money

`tests/llm/providers.test.ts` and `tests/llm/guardrails.test.ts` call real Anthropic,
OpenAI, Gemini, DashScope, and OpenRouter endpoints. They are gated only by
`describe.skipIf(!process.env.<PROVIDER>_API_KEY)`, and they sit inside vitest's
default `include`, so they are part of `bun run test`.

`.env` carries seven real provider keys, and **bun auto-loads `.env`**. So the keys
are effectively always present, and `unset ANTHROPIC_API_KEY` does not help — bun
re-reads it from the file.

- To run the suite WITHOUT billing: blank the keys explicitly (empty-string exports
  override `.env`; `unset` does not).
- To run the live tier deliberately: say so, and tell the user roughly what it will
  cost before starting.

## Hazard 2 — E2E mutates data, against whatever answers

`e2e/playwright.config.ts` declares no `webServer` and defaults to
`baseURL: http://localhost:3003`. On the primary dev machine **3003 is an unrelated
service** — Bridge runs on `NEXTJS_PORT` / `PLATFORM_PORT` from `.env`.

And E2E setup is not read-only: `e2e/seed.setup.ts` signs in as `eve@demo.edu`,
creates a fixture class via `POST /api/classes`, and enrols students.

**Refuse to run E2E if `E2E_BASE_URL` is unset**, or if it resolves to 3003 or 8002.
Do not "helpfully" fall back to the default — that is the bug.

Also confirm the target stack is pointed at a `*_test` database. `tests/helpers.ts`
enforces this for vitest, but E2E drives a *running server*, whose `DATABASE_URL`
this skill cannot see.

## Procedure

1. **Establish the target.** Read `.env` for `NEXTJS_PORT` / `PLATFORM_PORT`. Ask the
   user to confirm the stack URL if anything is ambiguous. Never guess.
2. **Check the stack is up** — all three services (Next.js, Go platform, Hocuspocus).
   Probe with `curl`; **never start or kill services** without being asked. Other
   people's processes live on this machine.
3. **State the cost** before any provider-key-backed run, and wait for confirmation.
4. **Run the requested tier:**
   - E2E: `E2E_BASE_URL=<confirmed> bun run test:e2e`
   - Live LLM: run `tests/llm/` with the relevant keys present, deliberately.
   - Neither: `bash scripts/ci-local.sh --fast` already covers everything else.
5. **Summarise**: pass/fail counts, which tier ran, what was skipped and why. If
   provider tests skipped because keys were blanked, say so — a skip that looks like
   a pass is how mock-only coverage gets mistaken for real verification.

## On failure

Do not immediately propose a fix. Hand the failure to `br-debug-from-live-failure`,
which collects evidence and runs the 2-way bug-investigation gate
(`docs/bug-investigation-gate.md`). A live-tier failure often reflects environment or
data state rather than the code under test, and guessing wastes a paid run.
