---
name: br-debug-from-live-failure
description: When a Bridge E2E or live-LLM test fails, collect the evidence (test source, service logs, recent git touches, DB state) and hand it to the 2-way bug-investigation gate — Claude self-investigation on Opus 5 plus a Codex subagent — for read-only diagnosis. Produces a root-cause hypothesis, not a patch. Use after a live-tier failure, before proposing any fix.
---

# br-debug-from-live-failure

Turns one failing live test into a diagnosis, by giving two independent investigators
the same evidence bundle and comparing what they conclude.

**This skill writes no code and proposes no patch.** Its output is a hypothesis with
file:line support. Fixing comes after, through the normal plan → gate flow.

Why the discipline: a live-tier failure has many more candidate causes than a unit
test failure — stale seed data, a service that isn't running, a schema drift, an
expired token, an actual bug. Jumping to the first plausible fix is how people spend
an afternoon fixing the wrong thing.

## Evidence to collect

Gather all of it before dispatching. An investigator with partial evidence produces a
confident wrong answer.

1. **The failing test's source** — the spec file and any fixture or helper it uses
   (`e2e/helpers.ts`, `e2e/seed.setup.ts`, `tests/helpers.ts`).
2. **The failure output verbatim** — assertion message, stack, and for Playwright the
   trace or screenshot path if one exists.
3. **Service logs** for the window around the failure: Next.js, Go platform,
   Hocuspocus. Read them; do not restart anything to "get clean logs".
4. **Recent git touches** to the implicated paths: `git log --oneline -10 -- <path>`.
   The single highest-yield question is usually "what changed most recently near this".
5. **Environment facts** — which stack the test targeted (`E2E_BASE_URL`), which
   database it used, whether the seed fixtures are present. A surprising number of
   live failures are environment, not code.

## Dispatch

Run both investigators in parallel, in one message.

- **Claude self-investigation**, inline on Opus 5. It holds the conversation context
  and recent-edit memory the external does not, so it is best placed to spot "we
  changed this an hour ago". Produce at least one independent hypothesis — if you
  cannot, you have not looked hard enough.
- **Codex**, via `codex:codex-rescue`. Its prompt must include the evidence bundle,
  suspected `file:line` touch points, the report format
  (`[BLOCKER]`/`[CONCERN]`/`[NIT]` plus a "top hypothesis" line), a ~600–800 word cap,
  and — explicitly — **"DO NOT WRITE CODE — diagnose only."**
  Codex runs with full filesystem access, so that instruction is prompt-enforced only.

## Cross-check

Compare the two reports:

- **Consensus** → high confidence. Act on it.
- **Unique insight** → one saw what the other missed. Often the most valuable output;
  take it seriously even though it is unconfirmed.
- **Contradiction** → the code is genuinely ambiguous. Read it yourself, or ask the
  user. Do not average the two answers.

## Output

A short written diagnosis: the failure, the top hypothesis with file:line support,
what evidence supports it, what would falsify it, and the cheapest next step to
confirm. Then stop and hand back — the fix goes through a plan and its gate.

Full rationale for the two-investigator design: `docs/bug-investigation-gate.md`.
