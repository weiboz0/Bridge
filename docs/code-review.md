# Code Review Process

Code review happens during Step 5 in `docs/development-workflow.md`. Bridge runs a **risk-tiered review** — 2-way or 4-way depending on the plan's `## File scope` — see `docs/reviewers.md` for the routing rule, dispatch table, and gate rules.

The plan file's `## Code Review` section is the communication channel between reviewers and authors. Both parties use the same document — reviewers add findings, authors respond inline.

## For reviewers

When performing a code review, append a new review round to the `## Code Review` section in the relevant plan file in `docs/plans/`. Format:

```markdown
### Review N

- **Date**: YYYY-MM-DD
- **Reviewer**: Codex, Claude, or human name
- **PR**: #N — title
- **Verdict**: Approved / Approved with suggestions / Changes requested

**Must Fix / Should Fix / Nice to Have**

1. `[OPEN]` `[codex]` Finding description with file:line references.
2. `[OPEN]` `[glm]` Another finding.
```

Each finding gets a numbered item with `[OPEN]` status. Prioritize as Must Fix / Should Fix / Nice to Have. Include file paths and line numbers. End with a 2-4 sentence summary.

**Tag every finding with its source**: `[claude-self]`, `[codex]`, `[opus]` (the independent fresh-context reviewer), or `[glm]`. When several reviewers independently raise the same finding, list every tag — convergence across independent reviewers is the strongest signal you get, and it should survive into the record.

If no plan file corresponds to the reviewed PR/branch, create a stub entry in the nearest matching plan file or note the absence explicitly.

## For authors

After addressing review findings, respond inline under each item:

```markdown
1. `[FIXED]` Finding description.
   → Response: What was done, commit ref.

2. `[WONTFIX]` Finding description.
   → Response: Why — e.g., deferred to Plan XXX, or by design.
```

Status values: `[OPEN]` (unaddressed), `[FIXED]` (resolved), `[WONTFIX]` (intentionally not fixing, with reason).

After responding to all findings, the reviewer (or a follow-up review round) can verify fixes and close the review, or add new findings as "Review N+1".
