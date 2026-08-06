---
plan: 090
title: Ad-hoc live sessions — any registered user can host, browse, and join
status: drafting
owner: orchestrator
branch: feat/090-adhoc-sessions
---

# Plan 090 — Ad-hoc live sessions

## Why

Today a live session is something a **teacher** (or org_admin / platform admin) starts, almost always from inside a class. We want live sessions to be a first-class primitive available to **any registered user**: start one ad-hoc with no class/course attached, let others **discover and join** it from a browse directory if it's marked browsable, or **join via a share link**.

A pre-implementation audit (the three Gap-5 sweeps recorded below) found the data model is already most of the way there — which narrows this plan to a host-gate change, one net-new discovery feature, a few consistency fixes, and the navigation/route work to make non-teacher hosting actually reachable in the UI.

### What already works (verified, no change needed)

- **Schema** — `sessions.class_id` is nullable (`drizzle/0014_session_model.sql:49`). A session can exist with no class.
- **Create (backend)** — `POST /api/sessions` already accepts `classId: null` and inserts a class-less session (`handlers/sessions.go:119-130`, `store/sessions.go:167`).
- **Link join** — `/s/{token}` → `JoinSessionByToken` inserts a participant row and works without class enrollment (`handlers/sessions.go:1573`). `GetStudentPage` honors that participant row regardless of `class_id` (`sessions.go:1538-1545`), so the joiner can load the room.
- **Realtime** — the Hocuspocus token mint + internal recheck authorizers (`handlers/realtime_token.go` `authorizeSessionDoc` ~399-414, `authorizeBroadcastDoc` ~464-469) fall through to a `session_participants` check when `class_id` is nil, so a link-joined guest collaborates in realtime in a class-less session.
- **Session sub-features** — AI tutor (`handlers/ai.go:102-116` defaults grade/language when `ClassID==nil`), annotations (`handlers/annotations.go:100-103` gates class-staff path on `ClassID != nil`), `isSessionAuthority` (`sessions.go:1123`), teacher/student page payloads, and attempts (`store/attempts.go` — no class coupling) all degrade gracefully for class-less sessions.
- **Frontend nil-safety** — teacher dashboard, student room, and `/s/[token]` all accept `classId: string | null` and use `/teacher`·`/student` return-path fallbacks. There is even an existing `mode="orphan"` start-session button on the `/teacher` dashboard (`src/components/teacher/start-session-button.tsx:39`).

### What's missing or broken (this plan's scope)

1. **Host gate** — class-less create requires `teacher`/`org_admin` in some org, or platform admin (`sessions.go:119-130` → `isTeacherOrOrgAdmin` 992-1009). A plain registered user with no org membership is **blocked**. Fresh registration creates no membership (`store/users.go:222-255`).
2. **`canJoinSession` early-return bug** — for class-less sessions it returns 403 for any non-teacher **before** checking the participant table (`sessions.go:505-510`), unlike `GetStudentPage`. This breaks, for ad-hoc guests: the regular `/join` POST, the SSE event stream (`sessions.go:654`, whose only fallback `isSessionOrgAdmin` returns false when `class_id` is nil — `sessions.go:1082`), and **help-queue raise-hand** (`ToggleHelp` → `canJoinSession`, `sessions.go:747`). Realtime is unaffected (separate authorizer).
3. **No discovery** — no `visibility`/browsable concept on sessions, no public-listing endpoint (`ListSessions` is host-scoped, `sessions.go:296`), no browse UI. Public self-join doesn't exist.
4. **Host dashboard route is teacher-gated** — `GetTeacherPage` authorizes any host by `TeacherID == UserID`, but the page lives under the `(portal)/teacher` shell which gates `portalRole="teacher"`. A non-teacher host cannot load their own session dashboard.
5. **No neutral entry point** — a role-less or student-only user routes to `/onboarding` or `/student` (`handlers/me.go` primaryRole); there's no "start a session" / "browse sessions" home.
6. **No abuse controls** — once anyone can host, nothing caps concurrent sessions per user.

## Decisions

1. **Host = any authenticated user.** Relax the class-less branch of `CreateSession` (`sessions.go:119-130`): when `body.ClassID == nil`, require only a valid authenticated user (drop the `isTeacherOrOrgAdmin` gate). Class-bound create keeps its existing `authorizeSessionCreateForClass` gate unchanged. Platform-admin bypass stays.

2. **Keep `sessions.teacher_id` as the host column.** No rename (it's referenced across handlers, stores, tests, and the realtime authorizers). Treat it semantically as "host"; add a clarifying comment at the column's store definition and in API docs. A rename is explicitly a non-goal — too much churn for no functional gain.

3. **Abuse cap: max concurrent live sessions per host.** Enforce a per-host limit of **5** simultaneously-`live` sessions in `CreateSession` (count `sessions WHERE teacher_id = $host AND status='live'`; return HTTP 429 with a clear message when exceeded). Platform admins are exempt. Constant lives in the handler, documented. **Race (Codex finding):** a bare pre-count then insert races under concurrent creates. Enforce inside the create transaction with a per-host advisory lock (`pg_advisory_xact_lock(hashtext('session_create:'||$host))`) so the count→insert is serialized per host. Note the existing "end prior live session" logic (`store/sessions.go:151-159`) is class-scoped and does NOT apply to class-less sessions — the cap is the only class-less guard. (Rationale: cheap, stops the obvious runaway; real rate-limiting is a follow-up.)

4. **`visibility` enum on sessions.** New column `visibility session_visibility NOT NULL DEFAULT 'unlisted'` with enum values `('unlisted','public')`. `unlisted` = current behavior (join by link/invite/class only; never listed). `public` = listed in the browse directory AND open-join for any authenticated user. Default `unlisted` preserves every existing session's behavior. Enum (not boolean) so a future `private`/`org_only` value is a non-breaking add. Migration adds the type + column; backfill is the default.

5. **`canJoinSession` consistency fix.** Restructure the class-less branch (`sessions.go:505-510`) so it does NOT early-return 403. Order for a class-less session becomes: admin/impersonator → host (`TeacherID`) → participant row `invited`/`present` → **`visibility=='public'` ⇒ allow open self-join** → else 403. For public open-join, `JoinSession` inserts a `present` participant row (idempotent). This single fix unblocks the regular join POST, SSE stream, and help-queue for ad-hoc guests, and enables browse-then-join. Class-bound behavior is unchanged.

5a. **Mirror the fix in store-level `CanAccessSession`** (Codex finding). `GET /api/sessions/{id}` gates on a *separate* check — handler `sessions.go:409-442` backed by `store/sessions.go:687-743` — not on `canJoinSession`. It has the same class-less limitation. **Required:** the class-less fall-through (participant row, then `visibility=='public'`) MUST be applied there as well — browse/link users would otherwise hit inconsistent 404s on the detail fetch. **The two checks MUST share a single helper** (not two parallel edits) so the access policy cannot drift; Phase 2 introduces that helper and routes both `canJoinSession` and `CanAccessSession` through it.

5b. **`GetSessionTopics` regression** (Codex finding). `GetSessionTopics` (`sessions.go:834-860`) restricts class-less callers to teacher/admin, so an ad-hoc guest 404s if the student room fetches topics (`src/components/session/student/student-session.tsx`). Relax it to also allow a `present`/`invited` participant (read-only) for class-less sessions, consistent with the fixes above. Add to Phase 2.

6. **Browse endpoint.** `GET /api/sessions/public` — returns `live` + `visibility='public'` sessions, newest first, paginated (`limit`/`cursor`), each with `{ id, title, hostName, participantCount, startedAt }`. No class filter. Auth required (any user). New store method `ListPublicSessions`. Participant count via a join/subquery on `session_participants` with status `present`.
   - **Route registration order (Codex finding):** register `/api/sessions/public` BEFORE the `/{id}` route, or `ValidateUUIDParam` middleware rejects the literal `public` as a malformed UUID (`sessions.go:45-75`). Static segments before the param route.
   - **Index (Codex finding):** the participant index today is `session_participants(session_id)` only (`schema.ts` ~306-312). The status-filtered count needs a composite `(session_id, status)` index — add it in the Phase 3 migration alongside the enum/column.

7. **Host can set visibility.** Extend `PatchSession` (`sessions.go:1225`) to accept `visibility` (`unlisted`|`public`), host/admin only. Surfaced in the host header UI as a toggle ("List publicly"). Default on create stays `unlisted`; create accepts an optional `visibility` too so a user can start a public session in one step.

8. **Role-neutral session routes.** Add `src/app/(portal)/sessions/` rendered through `PortalShell portalRole={null}` (the role-neutral shell pattern established by plan 089 for `/library`):
   - `/sessions` — browse directory of public live sessions + a "Start a session" affordance available to any user (reuses `StartSessionButton mode="orphan"`).
   - `/sessions/[id]` — the session room. Fetches `teacher-page` if the caller is the host (200) and renders `TeacherDashboard`; otherwise falls back to `student-page` and renders `StudentSession`. This makes hosting reachable for non-teacher hosts without duplicating the dashboard.
   - The existing `/teacher/sessions/*` and `/student/sessions/*` routes stay (teachers/students keep their portal entry points); the new neutral routes are additive. `/s/[token]` redirect target is updated to point class-less joins at `/sessions/[id]` (was `/student/sessions/[id]`), keeping class-bound joins where they are.

9. **Navigation + role-neutral admission.** Add a "Sessions" nav entry pointing at `/sessions` for every portal role (deduped by href the same way `/library` is).
   - **Admit any authenticated user to the neutral shell (revised after self-review + Codex finding).** The role-neutral `PortalShell portalRole={null}` and `/api/me/portal-access` today redirect/deny zero-role users (`src/components/portal/portal-shell.tsx:46-50`, `handlers/me.go:161-162` gating on `len(roles)>0`). For the `/sessions` subtree, admission must be "any authenticated user", not "has a portal role". This backend change MUST land before the frontend route is testable (see phase ordering).
   - **Drop the "session history" heuristic** from the earlier draft — computing whether a user has hosted/joined on every roles call is fuzzy and costly. Instead: `primaryPortalPath` for a brand-new zero-role user stays `/onboarding` (unchanged), and `/onboarding` plus the nav simply surface a "Browse / start a session" link to `/sessions`. `/sessions` itself is reachable by any authenticated user regardless of role. This is simpler and avoids redirect-loop risk.

10. **Tests fill the class-less gap.** The sweep noted there is **no** existing test coverage for class-less realtime or class-less join paths. Every backend phase adds integration tests for the class-less + public path specifically (create as plain user, cap enforcement, public browse listing, public open-join, help-queue/SSE for an ad-hoc guest, realtime token mint for a class-less participant).

## Non-goals

- **Anonymous (unauthenticated) join.** A login is always required; `/s/[token]` continues to bounce through sign-in. Public = "any logged-in user", not "the open internet".
- **Renaming `teacher_id` → `host_id`** or any broad host-vs-teacher refactor.
- **Moderation / reporting / kicking for public sessions** beyond the host's existing remove-participant control. Real abuse tooling (reporting, bans, rate-limit beyond the concurrent cap) is a follow-up.
- **Changes to class-bound or scheduled sessions.** Their auth, topic snapshots, and scheduling are untouched.
- **A `private`/`org_only` visibility tier.** The enum leaves room for it; building it is out of scope.
- **Recording/persistence changes**, AI policy changes, or new editor modes.

## Phases

### Phase 1 — Backend: any-user host + abuse cap *(Codex)* — ✅ COMPLETE (`9463784`)

> Deviation: concurrent cap scoped to class-less live sessions (`class_id IS NULL`) rather than all of a host's live sessions, so multi-class teachers aren't penalised (class-bound create already self-limits). Verified: 6 new integration tests pass; full handlers+store suite green against `bridge_test` (166s / 30s).

- Relax class-less create gate (Decision 1). Keep class-bound + admin paths intact.
- Add concurrent-live cap per host (Decision 3): new store count method, 429 on exceed, admin-exempt.
- Comment `teacher_id` as host (Decision 2).
- Tests: plain registered user (no org membership) can create a class-less session; student-role user can; cap returns 429 at limit+1; admin exempt; class-bound create still gated (cross-user 403 preserved).

### Phase 2 — Backend: class-less access consistency fixes *(Codex)* — ✅ COMPLETE (`b962c3b`)

> Implementation note: store `CanAccessSession` already handled class-less participants correctly (its participant check is unconditional); the bug was only in handler `canJoinSession`. Unified by having `canJoinSession` delegate to `CanAccessSession` (true single source of truth). Side effect: joining an *ended* session now returns 410 (was 400 in `JoinSession`), matching the token-join path. Verified: 8 new tests pass; full handlers (179s) + store (33s) suites green.

Consolidates ALL the class-less access-check fixes (no `visibility` yet — that's Phase 3 — to isolate the bugfix from the feature):
- Restructure `canJoinSession` class-less branch (Decision 5) to fall through to the participant-row check.
- Apply the same fall-through to store-level `CanAccessSession` (Decision 5a) **via one shared helper** that both `canJoinSession` and `CanAccessSession` call — single source of truth, no drift.
- Relax `GetSessionTopics` for class-less `present`/`invited` participants (Decision 5b).
- Verify SSE (`SessionEvents`), `ToggleHelp`, and session-detail `GET /{id}` now work for an invited/present ad-hoc guest.
- Tests: ad-hoc invited guest passes `canJoinSession` AND `CanAccessSession` AND `GetSessionTopics`; raises hand; subscribes to SSE; `left` status still denied; class-bound matrix unchanged (table-driven, both class-bound and class-less rows).

### Phase 3 — Backend: visibility + browse + public open-join *(Codex)* — ✅ COMPLETE (`8503aaa`)

> Migration `0027` applied to `bridge` + `bridge_test` (psql -f; drizzle journal isn't the runtime applier). No `migrations.go` change (0027 has no CREATE TABLE → probe stays on 0026; parity test confirms). Two regressions from the `sessionColumns` change were caught by the suite and fixed in-phase: `StartScheduledSession` scan (the one session scan outside `sessions.go`) and `JoinSession` idempotency guard (also now lets a `left` user rejoin a public session). Verified: 9 new tests + full handlers/store/db suites green.


- Migration: `session_visibility` enum + `sessions.visibility` column default `'unlisted'`, AND the `session_participants(session_id, status)` composite index (Decision 6). Regenerate drizzle. Update `store/sessions.go` scan/insert **and verify column scan order** (Codex: scan at ~110-117 is positional and fragile) and the TS schema mirror (`src/lib/db/schema.ts` ~227-253, which has no visibility column today).
- `CreateSession` accepts optional `visibility`; `PatchSession` accepts `visibility` (host/admin only) — Decision 7.
- `canJoinSession` + `CanAccessSession`: add the `visibility=='public'` open-join clause (Decision 5/5a); `JoinSession` idempotent-inserts a `present` row for public open-join.
- `ListPublicSessions` store method + `GET /api/sessions/public` handler, **registered before `/{id}`** (Decision 6).
- Tests: default visibility `unlisted`; only `public`+`live` in browse; non-host cannot set visibility; public open-join inserts participant + idempotent; ended/unlisted excluded; pagination; the `public` literal does not hit `ValidateUUIDParam`.

### Phase 4 — Backend: role-neutral admission + me.go — ✅ COMPLETE
Implemented inline (auth-surface contract change, tightly coupled across Go + TS). **Deviation from plan text, folded after review:** rather than flipping `me.go`'s `authorized` field (which has 3 consumers — `portal-shell.tsx` + both library pages — that use it as a login gate), added a **new `authenticated` field**. `authorized` keeps its `len(roles)>0` meaning, so those consumers are byte-for-byte unchanged; the neutral shell admits on `authenticated`. Role-specific portal behavior preserved exactly. Tests: `me_test.go` no-claims → both flags false; `portal-shell.test.tsx` 9 cases (neutral admits roleless/authenticated, /login on unauthenticated, role-specific gates preserved).

Original spec (kept for reference):
Must land BEFORE the frontend route (Codex ordering finding — the neutral shell is dead without it):
- `/api/me/portal-access` (`handlers/me.go:161-162`) + `PortalShell` (`portal-shell.tsx:46-50`): admit any authenticated user to the role-neutral (`portalRole=null`) subtree instead of requiring `len(roles)>0`. Keep per-role gating for role-specific subtrees unchanged.
- Leave `primaryPortalPath` for brand-new zero-role users as `/onboarding` (Decision 9 — no history heuristic).
- Tests: zero-role authenticated user is admitted to the neutral shell; role-specific portals still gate.

### Phase 5 — Frontend: neutral routes, browse, host reachability, visibility toggle — ✅ COMPLETE
Built by Sonnet, verified inline (tsc clean, lint ratchet clean, 768/768 unit tests). Three sub-decisions beyond the plan text, all reviewed and kept:
- **Nav dedup by href *or label*, not href alone.** Teacher already has a "Sessions"-labelled entry (`/teacher/sessions`); adding a second labelled "Sessions" would duplicate the label, so teacher is skipped. Admin/org_admin/student/parent gain `Sessions → /sessions`.
- **Visibility toggle self-determines host** via `GET /api/sessions/{id}` + `useSession()` (host == `teacherId` or platform admin) rather than a new prop — `TeacherHeader` also mounts for class-bound non-owning instructors, for whom the PATCH is backend-forbidden. Client gate mirrors the backend; backend PATCH is the real enforcement.
- **Dispatcher overrides `returnPath` to `/sessions` for class-less sessions.** Go's teacher-page/student-page hardcode `/teacher`/`/student`, which would bounce a roleless host/guest through a role gate. Class-bound `returnPath` untouched.

Original spec (kept for reference):
- `src/app/(portal)/sessions/layout.tsx` → `PortalShell portalRole={null}`.
- `/sessions` browse page: list from `GET /api/sessions/public` (title, host, count, started-at, Join) + "Start a session" (`StartSessionButton mode="orphan"`, available to any user).
- `/sessions/[id]` room: fetch `teacher-page` first; if 200 → `TeacherDashboard` (host), else `student-page` → `StudentSession`. Reuse existing components.
- **Redirect branching (Codex finding):** `StartSessionButton` currently always routes to `/teacher/sessions/{id}` (`start-session-button.tsx:82-83`) and `/s/[token]` to `/student/sessions/{id}` (`s/[token]/page.tsx:77-83`). Update both: class-less / non-teacher host → `/sessions/{id}`; class-bound paths unchanged. Prevents hosts/guests landing in a portal that bounces them.
- Visibility toggle in `src/components/session/teacher/teacher-header.tsx` (PATCH `visibility`).
- Nav: add "Sessions" → `/sessions` to each role config + the onboarding page link, deduped by href (Decision 9).
- Tests (Sonnet): browse renders/empty-state; host vs participant selection; visibility toggle PATCHes; redirect branching; nav dedupe.

### Phase 6 — Verify + docs — ✅ COMPLETE
- Docs: `docs/api.md` gained an "Ad-hoc (orphan) sessions" section (public list, visibility toggle, route order, concurrent cap, neutral routes, deferred-abuse note); `README.md` gained an ad-hoc-sessions feature bullet.
- Full suite: `go test ./... -count=1` green; `bun run test` 768/768 (95 files); `bunx tsc --noEmit` clean; lint ratchet clean.
- E2E: `e2e/adhoc-sessions.spec.ts` (host → publish → browse → join on a class-less session) written to the existing session-spec pattern and verified collectable via `playwright test --list`. **NOT executed against a live stack** — Bridge E2E needs all three services up and a pinned `E2E_BASE_URL` (`docs/testing.md`); no such run happened in this environment.

Original spec (kept for reference):
- Docs: `docs/` session/API docs + `README.md` feature bullet ("any user can host ad-hoc sessions; browse or join by link"). Document `visibility`, the browse endpoint + route order, the concurrent cap, the neutral routes, and the deferred-abuse note.
- Full suite: `bun run test`, `cd platform && go test ./... -count=1`, targeted E2E for host→browse→join on a class-less public session.

## Risks

- **Abuse surface.** Any user hosting public sessions invites spam/abuse. Mitigation in-scope: auth required, concurrent cap, host-only controls. Out-of-scope but flagged: reporting/bans, per-window rate limits, content moderation. Call this out in the PR so it's a conscious deferral with this plan as the follow-up anchor.
- **`canJoinSession` is load-bearing.** It gates join, SSE, help-queue, and is referenced by page loaders. The restructure (Phase 2) must preserve every class-bound path exactly. Mitigation: phase the bugfix separately from the visibility clause; table-driven tests for both class-bound and class-less matrices before and after.
- **Enum migration on a hot column.** Adding an enum + column is additive and backfills to default; low risk. Verify the TS schema mirror and any `SELECT *`/scan ordering in `store/sessions.go` are updated together (a missed scan column is the classic break).
- **Route duplication / drift.** Three session route trees (`/teacher`, `/student`, `/sessions`) risk divergence. Mitigation: the neutral routes reuse the existing `TeacherDashboard`/`StudentSession` components rather than forking them; portal routes become thin entry points.
- **Role-neutral admission change.** Admitting zero-role users to the neutral `/sessions` subtree (Phase 4) risks redirect loops if `portal-access`/`PortalShell`/middleware disagree on who's allowed. Mitigation: `primaryPortalPath` is unchanged (brand-new zero-role users still land on `/onboarding` — no history heuristic, per Decision 9); only the neutral-subtree admission check is relaxed to "any authenticated user"; role-specific portals keep their gates; explicit test for a zero-role user reaching `/sessions` without bouncing.
- **Participant-count query cost** on the browse endpoint. Mitigation: bounded page size + index on `session_participants(session_id, status)` (verify it exists; add if not).

## Plan Review

### Round 1 — Self-review (Opus 4.8) + Codex (parallel), 2026-06-08

**Self-review (Opus) — APPROVE WITH CHANGES.** Concerns raised and resolved into the plan:
- *Decision 9 over-engineered.* The "give `/sessions` as primary path to zero-role users with session history" rule needs a per-call history query and is a fuzzy heuristic. → **Resolved:** dropped it; `/sessions` is reachable by any authenticated user via the neutral shell, `/onboarding` stays the zero-role primary path, and a "Browse/start a session" link is surfaced in nav + onboarding. (Folded into Decision 9 + Phase 4.)
- *Two-fetch host/participant selection on `/sessions/[id]` is slightly wasteful/racy.* → **Accepted as-is:** documented fallback order (teacher-page first, then student-page); a unified payload endpoint is a possible follow-up, not worth the surface now.
- *Dropping the teacher gate lets a student-role org member host class-less sessions.* → **Conscious accept:** matches the explicit requirement ("any registered user"); class-bound sessions are unaffected. Called out in Risks/PR.

**Codex — APPROVE WITH CHANGES.** Findings and resolutions:
- *`GET /api/sessions/{id}` uses a separate store-level `CanAccessSession` (`sessions.go:409-442`, `store/sessions.go:687-743`) with the same class-less limitation.* → **Resolved:** Decision 5a + Phase 2 apply the identical fall-through there (shared helper preferred).
- *`GetSessionTopics` (`sessions.go:834-860`) 404s class-less guests if the student room fetches topics.* → **Resolved:** Decision 5b + Phase 2 relax it for class-less participants.
- *Concurrent-create race on the cap pre-count.* → **Resolved:** Decision 3 now uses a per-host `pg_advisory_xact_lock` inside the create txn; noted the class-scoped "end prior live" logic doesn't cover class-less.
- *Role-less admission ordering — `portal-access`/`PortalShell` gate `len(roles)>0`, so the neutral route is dead until that changes.* → **Resolved:** new Phase 4 (backend admission) lands before Phase 5 (frontend).
- *`/api/sessions/public` route must register before `/{id}` or `ValidateUUIDParam` rejects `public`.* → **Resolved:** Decision 6 + Phase 3.
- *`/s/[token]` and `StartSessionButton` hard-route to `/student`·`/teacher` portals → bounce loops for guests/non-teacher hosts.* → **Resolved:** Phase 5 redirect branching.
- *Participant index is `(session_id)` only; status-filtered browse count needs a composite index; positional scan order in `store/sessions.go` is fragile across the new column.* → **Resolved:** Decision 6 + Phase 3 (composite index in migration; verify scan order + TS mirror).

All findings folded; no open blockers. **Round 2 below re-confirms with Codex against the revised plan.**

### Round 2 — Codex re-confirm, 2026-06-08

**Codex — APPROVE WITH CHANGES.** Confirmed findings 2–6 fully resolved. Two doc-consistency items, both folded:
- *Finding 1 (store-level `CanAccessSession`) used soft "preferred/ideally" language.* → **Resolved:** Decision 5a + Phase 2 now make the shared single-helper mandatory ("MUST share a single helper").
- *New: Risks still described the dropped session-history rerouting, contradicting Decision 9.* → **Resolved:** Risks "Role-neutral admission" bullet rewritten to match (primaryPortalPath unchanged, only neutral-subtree admission relaxed).

### Verdict — APPROVED FOR IMPLEMENTATION

Both reviewers concur. Self-review: APPROVE. Codex: APPROVE (Round-2 changes were trivial doc-alignment, now applied — no design questions remain open). No open blockers. Implementation may begin on `feat/090-adhoc-sessions`.

## Code Review

_(3-way: self + Codex + GLM against the consolidated branch diff, before PR.)_

## Post-Execution Report

_(Filled before shipping.)_
