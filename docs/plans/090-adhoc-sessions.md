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

3. **Abuse cap: max concurrent live sessions per host.** Enforce a per-host limit of **5** simultaneously-`live` sessions in `CreateSession` (count `sessions WHERE teacher_id = $host AND status='live'`; return HTTP 429 with a clear message when exceeded). Platform admins are exempt. Constant lives in the handler, documented. (Rationale: cheap, stops the obvious runaway; real moderation/rate-limiting is a follow-up.)

4. **`visibility` enum on sessions.** New column `visibility session_visibility NOT NULL DEFAULT 'unlisted'` with enum values `('unlisted','public')`. `unlisted` = current behavior (join by link/invite/class only; never listed). `public` = listed in the browse directory AND open-join for any authenticated user. Default `unlisted` preserves every existing session's behavior. Enum (not boolean) so a future `private`/`org_only` value is a non-breaking add. Migration adds the type + column; backfill is the default.

5. **`canJoinSession` consistency fix.** Restructure the class-less branch (`sessions.go:505-510`) so it does NOT early-return 403. Order for a class-less session becomes: admin/impersonator → host (`TeacherID`) → participant row `invited`/`present` → **`visibility=='public'` ⇒ allow open self-join** → else 403. For public open-join, `JoinSession` inserts a `present` participant row (idempotent). This single fix unblocks the regular join POST, SSE stream, and help-queue for ad-hoc guests, and enables browse-then-join. Class-bound behavior is unchanged.

6. **Browse endpoint.** `GET /api/sessions/public` — returns `live` + `visibility='public'` sessions, newest first, paginated (`limit`/`cursor`), each with `{ id, title, hostName, participantCount, startedAt }`. No class filter. Auth required (any user). New store method `ListPublicSessions`. Participant count via a join/subquery on `session_participants` with status `present`.

7. **Host can set visibility.** Extend `PatchSession` (`sessions.go:1225`) to accept `visibility` (`unlisted`|`public`), host/admin only. Surfaced in the host header UI as a toggle ("List publicly"). Default on create stays `unlisted`; create accepts an optional `visibility` too so a user can start a public session in one step.

8. **Role-neutral session routes.** Add `src/app/(portal)/sessions/` rendered through `PortalShell portalRole={null}` (the role-neutral shell pattern established by plan 089 for `/library`):
   - `/sessions` — browse directory of public live sessions + a "Start a session" affordance available to any user (reuses `StartSessionButton mode="orphan"`).
   - `/sessions/[id]` — the session room. Fetches `teacher-page` if the caller is the host (200) and renders `TeacherDashboard`; otherwise falls back to `student-page` and renders `StudentSession`. This makes hosting reachable for non-teacher hosts without duplicating the dashboard.
   - The existing `/teacher/sessions/*` and `/student/sessions/*` routes stay (teachers/students keep their portal entry points); the new neutral routes are additive. `/s/[token]` redirect target is updated to point class-less joins at `/sessions/[id]` (was `/student/sessions/[id]`), keeping class-bound joins where they are.

9. **Navigation.** Add a "Sessions" nav entry pointing at `/sessions` for every portal role (deduped by href the same way `/library` is). For role-less authenticated users, `/sessions` is reachable directly (role-neutral shell) and `handlers/me.go` is extended so a user with zero roles gets `primaryPortalPath: "/sessions"` instead of `/onboarding` only when they have previously hosted/joined a session — otherwise `/onboarding` is unchanged. (Keep the onboarding flow intact; just stop stranding session users.)

10. **Tests fill the class-less gap.** The sweep noted there is **no** existing test coverage for class-less realtime or class-less join paths. Every backend phase adds integration tests for the class-less + public path specifically (create as plain user, cap enforcement, public browse listing, public open-join, help-queue/SSE for an ad-hoc guest, realtime token mint for a class-less participant).

## Non-goals

- **Anonymous (unauthenticated) join.** A login is always required; `/s/[token]` continues to bounce through sign-in. Public = "any logged-in user", not "the open internet".
- **Renaming `teacher_id` → `host_id`** or any broad host-vs-teacher refactor.
- **Moderation / reporting / kicking for public sessions** beyond the host's existing remove-participant control. Real abuse tooling (reporting, bans, rate-limit beyond the concurrent cap) is a follow-up.
- **Changes to class-bound or scheduled sessions.** Their auth, topic snapshots, and scheduling are untouched.
- **A `private`/`org_only` visibility tier.** The enum leaves room for it; building it is out of scope.
- **Recording/persistence changes**, AI policy changes, or new editor modes.

## Phases

### Phase 1 — Backend: any-user host + abuse cap *(Codex)*
- Relax class-less create gate (Decision 1). Keep class-bound + admin paths intact.
- Add concurrent-live cap per host (Decision 3): new store count method, 429 on exceed, admin-exempt.
- Comment `teacher_id` as host (Decision 2).
- Tests: plain registered user (no org membership) can create a class-less session; student-role user can; cap returns 429 at limit+1; admin exempt; class-bound create still gated (cross-user 403 preserved).

### Phase 2 — Backend: `canJoinSession` consistency fix *(Codex)*
- Restructure class-less branch (Decision 5) to fall through participant-row check; no `visibility` logic yet (kept in Phase 3 to isolate the bugfix).
- Verify SSE (`SessionEvents`) and `ToggleHelp` now work for an invited/present ad-hoc guest.
- Tests: ad-hoc invited guest passes `canJoinSession`; raises hand; subscribes to SSE; `left` status still denied; class-bound unchanged.

### Phase 3 — Backend: visibility + browse + public open-join *(Codex)*
- Migration: `session_visibility` enum + `sessions.visibility` column default `'unlisted'` (`drizzle/` + regenerate). Update `store/sessions.go` scan/insert and the TS schema mirror (`src/lib/db/schema.ts`).
- `CreateSession` accepts optional `visibility`; `PatchSession` accepts `visibility` (host/admin only) — Decision 7.
- `canJoinSession`: add the `visibility=='public'` open-join clause (Decision 5); `JoinSession` idempotent-inserts a `present` row for public open-join.
- `ListPublicSessions` store method + `GET /api/sessions/public` handler + route registration (Decision 6).
- Tests: default visibility is `unlisted`; only `public`+`live` appear in browse; non-host cannot set visibility; public open-join inserts participant + is idempotent; ended/unlisted excluded from browse; pagination.

### Phase 4 — Frontend: neutral routes, browse, host reachability, visibility toggle *(Sonnet)*
- `src/app/(portal)/sessions/layout.tsx` → `PortalShell portalRole={null}`.
- `/sessions` browse page: list from `GET /api/sessions/public` (title, host, count, started-at, Join button) + "Start a session" (`StartSessionButton mode="orphan"`, available to any user).
- `/sessions/[id]` room: host → `TeacherDashboard`, else → `StudentSession` (reuse existing components; pick by which page payload returns 200).
- Visibility toggle in `src/components/session/teacher/teacher-header.tsx` (PATCH `visibility`).
- Update `/s/[token]` class-less redirect → `/sessions/[id]` (Decision 8).
- Nav: add "Sessions" → `/sessions` to each role config, deduped by href (Decision 9).
- Tests (Sonnet): browse page renders/empty-state; host vs participant view selection; visibility toggle calls PATCH; nav dedupe.

### Phase 5 — Backend: routing + me.go + verify + docs
- `handlers/me.go`: role-less session users → `/sessions` primary path (Decision 9), with test.
- Docs: update `docs/` session/API docs + `README.md` feature bullet ("any user can host ad-hoc sessions; browse or join by link"). Document `visibility`, the browse endpoint, the concurrent cap, and the neutral routes.
- Full suite: `bun run test`, `cd platform && go test ./... -count=1`, targeted E2E for host→browse→join on a class-less public session.

## Risks

- **Abuse surface.** Any user hosting public sessions invites spam/abuse. Mitigation in-scope: auth required, concurrent cap, host-only controls. Out-of-scope but flagged: reporting/bans, per-window rate limits, content moderation. Call this out in the PR so it's a conscious deferral with this plan as the follow-up anchor.
- **`canJoinSession` is load-bearing.** It gates join, SSE, help-queue, and is referenced by page loaders. The restructure (Phase 2) must preserve every class-bound path exactly. Mitigation: phase the bugfix separately from the visibility clause; table-driven tests for both class-bound and class-less matrices before and after.
- **Enum migration on a hot column.** Adding an enum + column is additive and backfills to default; low risk. Verify the TS schema mirror and any `SELECT *`/scan ordering in `store/sessions.go` are updated together (a missed scan column is the classic break).
- **Route duplication / drift.** Three session route trees (`/teacher`, `/student`, `/sessions`) risk divergence. Mitigation: the neutral routes reuse the existing `TeacherDashboard`/`StudentSession` components rather than forking them; portal routes become thin entry points.
- **me.go routing change.** Changing primaryPortalPath risks redirect loops for edge identities. Mitigation: only reroute zero-role users who have session history; keep `/onboarding` for brand-new users; explicit test.
- **Participant-count query cost** on the browse endpoint. Mitigation: bounded page size + index on `session_participants(session_id, status)` (verify it exists; add if not).

## Plan Review

_(2-way: self-review on Opus + Codex, dispatched in parallel. Verdicts recorded below before any implementation.)_

## Code Review

_(3-way: self + Codex + GLM against the consolidated branch diff, before PR.)_

## Post-Execution Report

_(Filled before shipping.)_
