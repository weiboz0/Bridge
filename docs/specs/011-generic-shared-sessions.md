# 011 — Generic Shared Sessions

## Problem

Bridge's current `sessions` row represents both a collaboration space and one
live teaching interval. That coupling makes the ad-hoc workflow difficult to
operate:

- a user can create a class-less row through the API, but there is no complete
  role-neutral create-and-join experience;
- the share link must be generated after creation and there is no short code
  entry flow;
- ending the live interval makes the session inaccessible even though its
  content and participants are stored durably;
- organization roles leak into portal admission and session behavior;
- `session_participants.status` mixes durable membership with transient
  presence; and
- the unshipped public-directory work adds discovery and moderation surface
  without helping the core invited-teaching workflow.

The immediate goal is an operable end-to-end shared teaching session: any
authenticated user can create a persistent space, invite other users by a
rotatable code or link, collaborate across multiple teaching runs, and archive
the space when it is no longer needed.

## Product Principles

1. **A session is a durable collaboration space.** Starting and ending live
   teaching does not create or destroy the space.
2. **Ad-hoc is the generic case.** Class and schedule associations are optional
   context attached to the same session model, not prerequisites for creating
   one.
3. **Roles are scoped to a session.** A single account may be a teacher in one
   session, a student in another, and an observer in a third.
4. **Invitations are private credentials.** Shared sessions are reached through
   membership, a short code, or a share link; there is no public directory.
5. **The first release is a complete vertical slice.** Creation, invitation,
   joining, realtime authorization, repeated runs, archiving, and recovery must
   work together before the branch ships.

## Conceptual Model

### Session

A session is the persistent aggregate root.

```text
session
├── id
├── title
├── owner_user_id
├── lifecycle            active | archived
├── class_id              nullable context
├── scheduled_session_id  nullable context
├── settings
├── created_at
├── updated_at
└── archived_at           nullable
```

The existing `sessions.teacher_id` column remains physically named for this
plan because a repository-wide rename would add risk without changing
authority. Code and API documentation treat it as `owner_user_id`. Ownership
is immutable in this scope.

`active` means members may enter the workspace and a teacher may start a run.
`archived` means no new joins or runs are allowed and existing members receive
read-only access. Restoring an archived session returns it to `active`, but
does not restore its revoked invitation.

### Session membership

Membership is durable authorization, independent of whether a user is
currently connected.

```text
session_participants
├── session_id
├── user_id
├── role          teacher | student | observer
├── membership    active | removed
├── invited_by    nullable
├── invited_at    nullable
├── joined_at     nullable
├── removed_at    nullable
├── created_at
└── updated_at
```

The existing table name remains for compatibility, but its status semantics
change from transient `invited/present/left` state to durable membership.
Connection presence belongs to the current run and is not an authorization
source.

The creator is inserted as an active `teacher` in the same transaction that
creates the session. Joiners default to `student`. A teacher may change an
active member among `teacher`, `student`, and `observer`. The owner cannot be
demoted or removed.

Removing a member sets `membership=removed`; it does not delete the audit row.
A removed user cannot reactivate membership with the current invitation. A
teacher must explicitly restore that membership.

### Session invitation

An active session has at most one invitation credential pair.

```text
session invitation
├── short_code       cryptographically generated, human-enterable
├── link_token       cryptographically generated, opaque
├── generation       monotonically increasing
├── created_at
├── rotated_at       nullable
└── revoked_at       nullable
```

The implementation may store the current pair on `sessions`; a separate
history table is unnecessary because prior credentials become invalid
immediately and no invitation audit UI is required.

The display code uses eight unambiguous Crockford Base32 characters formatted
as `XXXX-XXXX`. Input is case-insensitive and ignores the hyphen. The share
link uses the stronger opaque token: `/s/{linkToken}`. Both values are created
together and rotated atomically.

Rotation affects only future joins. Existing active memberships continue to
work. Archiving revokes both credentials. Restoring a session leaves the
invitation revoked until the owner generates a fresh pair.

Manual code joins require authentication and use a per-user and per-IP rate
limit. Link joins require authentication and use the existing login callback
flow. Failed joins do not reveal the session title, owner, or lifecycle.

### Session run

A run is one live teaching interval inside a persistent session.

```text
session_runs
├── id
├── session_id
├── started_by
├── started_at
├── ended_by       nullable
├── ended_at       nullable
└── created_at
```

At most one run may have `ended_at IS NULL` for a session. A partial unique
index enforces that invariant, while the start operation also locks the
session row so concurrent callers receive deterministic results.

Ending a run does not change membership, invitation credentials, workspace
content, attempts, or annotations. Starting again creates a new run against
the same session and document identifiers. Existing content therefore appears
when teaching resumes.

Existing session rows are backfilled with one run using their current
`started_at` and `ended_at` values. API compatibility fields that currently
report `live` or `ended` are derived from whether an active run exists while
existing class-backed consumers are migrated to the run-aware endpoints.

## Authorization

Global and organization roles do not authorize behavior inside a shared
session. They continue to govern organization and class administration.

| Action | Owner | Teacher member | Student member | Observer member | Non-member |
|---|---:|---:|---:|---:|---:|
| View active workspace | Yes | Yes | Yes | Yes | No |
| Edit own workspace | Yes | Yes | Yes | No | No |
| Use teaching controls | Yes | Yes | No | No | No |
| Start/end a run | Yes | Yes | No | No | No |
| Change non-owner member roles | Yes | Yes | No | No | No |
| Remove/restore non-owner members | Yes | Yes | No | No | No |
| Rotate/revoke invitation | Yes | No | No | No | No |
| Archive/restore session | Yes | No | No | No | No |
| View archived workspace read-only | Yes | Yes | Yes | Yes | No |
| Join with valid invitation | Existing membership unchanged | Existing membership unchanged | Existing membership unchanged | Existing membership unchanged | Becomes student |

Realtime token minting and Hocuspocus authorization enforce observer and
archived-session read-only behavior. The frontend may hide edit controls, but
hidden controls are not an authority boundary.

Class context affects who may associate a session with a class; it does not
override the session membership matrix after creation.

## User Experience

### Sessions home

`/sessions` is available to every authenticated user through a role-neutral
portal shell. It contains:

- **Create session** — asks only for a title;
- **Join with code** — accepts either `XXXXXXXX` or `XXXX-XXXX`;
- **My sessions** — active sessions where the user has active membership; and
- **Archived** — sessions the user may inspect read-only.

There is no public browse list or visibility toggle.

### Create

Submitting a title performs one backend transaction:

1. create the active session;
2. insert the owner as an active teacher;
3. create the first run;
4. create the short code and link token; and
5. return the room payload and invitation display values.

The client routes directly to `/sessions/{sessionId}`. The host immediately
sees the short code, a copy-code action, the share link, and a copy-link action.
There is no separate invitation-generation step.

### Join

Manual entry posts the normalized code to a join endpoint. A share link posts
its opaque token through the existing `/s/{token}` route. Both paths execute
the same transactional join policy and redirect class-less sessions to the
role-neutral room route.

Joining is idempotent for active members. A removed member receives a generic
denial. An archived session, revoked credential, unknown credential, or
superseded credential generation never discloses session metadata.

After joining once, the session appears under **My sessions** and the member
may return without using the invitation.

### Teach, observe, and resume

The room selects controls from session membership rather than an account's
portal role:

- teachers receive the teacher dashboard and participant management;
- students receive the interactive student workspace; and
- observers receive a read-only workspace and presence view.

“End teaching” ends the active run and returns the room to an inactive-but-
available state. A teacher may select “Resume teaching” to start another run.
The invitation remains valid while the session is active.

### Rotate and archive

Only the owner sees invitation rotation and session archive controls. Rotation
returns and displays a new code/link pair; the previous pair fails
immediately. Active members are unaffected.

Archiving confirms the destructive effect, ends any active run, revokes the
invitation, and switches every member to read-only access. Restore returns the
session to the active list. The owner must explicitly generate fresh
credentials before inviting additional members.

## API Shape

The exact route handlers follow existing Bridge conventions and remain under
authenticated middleware.

```text
POST   /api/sessions
       { title }
       -> { session, membership, activeRun, inviteCode, inviteUrl }

GET    /api/sessions/mine?lifecycle=active|archived
       -> sessions where caller has active membership

GET    /api/sessions/{id}/room
       -> one membership-aware payload for teacher, student, or observer

POST   /api/sessions/join-code
       { code }
       -> { sessionId }

POST   /api/s/{linkToken}/join
       -> { sessionId }

POST   /api/sessions/{id}/invitation/rotate
DELETE /api/sessions/{id}/invitation

POST   /api/sessions/{id}/runs
POST   /api/sessions/{id}/runs/{runId}/end

PATCH  /api/sessions/{id}/members/{userId}
       { role } or { membership: "active" | "removed" }

POST   /api/sessions/{id}/archive
POST   /api/sessions/{id}/restore
```

The consolidated `/room` response replaces frontend probing between
`teacher-page` and `student-page` for the neutral route. Existing class routes
may keep compatibility handlers while their payloads delegate to the same
membership-aware store policy.

## Consistency and Failure Handling

- Session creation is atomic. No session remains without its owner membership,
  first run, and invitation pair.
- Code and token generation use `crypto/rand`. Unique-constraint collisions
  retry a bounded number of times; exhaustion returns a service error and
  rolls back creation or rotation.
- Invitation rotation locks the session row and updates both credentials and
  generation in one transaction.
- Code and token joins share one store operation. Concurrent repeated joins
  produce one active membership.
- A partial unique index prevents multiple active runs. The API returns the
  existing active run for idempotent starts by the same authorized caller and
  a conflict for incompatible concurrent state changes.
- Archiving locks the session, ends the active run, revokes credentials, and
  records `archived_at` atomically.
- Restoring clears `archived_at` but never recreates credentials implicitly.
- Removed membership, observer writes, archived writes, and unauthorized role
  changes are rejected in Go handlers and realtime authorization.
- Infrastructure failures remain errors; they are never converted to empty
  session lists or successful no-ops.

## Compatibility and Migration

Plan 090 already committed backend work for class-less creation, access-policy
repairs, and an unshipped public visibility/browse experiment. The completed
branch must preserve the first two foundations and remove the third from the
final product and API surface.

The schema migration must:

1. add durable session lifecycle fields;
2. add session-scoped role and durable membership fields;
3. add the short invite code and invitation generation;
4. add `session_runs` and its one-active-run constraint;
5. backfill owner memberships and one run per existing session;
6. preserve existing invite tokens as the current link credential where they
   are valid;
7. remove the unshipped visibility column, public-listing index, public route,
   and related TypeScript schema fields from the branch migration; and
8. update all positional Go scans and generated schema metadata together.

Existing class-backed session creation, schedule start, session pages,
attempts, annotations, help queue, broadcast, and realtime flows must retain
their current behavior. Their live/ended interpretation is derived from
`session_runs` after migration.

## Verification

### Backend integration coverage

- a zero-organization-role user creates a session and receives both invite
  forms;
- the owner is an active teacher and the first run is active;
- code and link joins create student memberships and are idempotent;
- malformed, unknown, revoked, archived, removed-member, and rate-limited joins
  fail without metadata disclosure;
- rotation invalidates both old credentials while preserving existing access;
- teachers can change non-owner roles and manage runs;
- students cannot use teacher actions;
- observers cannot mint write-capable realtime access or mutate workspace data;
- ending and resuming runs preserves membership and content identifiers;
- archive is atomic and read-only; restore requires fresh invitations;
- concurrent create, join, rotate, start-run, and archive cases preserve their
  invariants; and
- class-backed authorization and schedule-start regressions remain green.

### Frontend coverage

- sessions home renders create, join, active, empty, and archived states;
- create routes to the neutral room and displays code/link immediately;
- code join and link join redirect to the same neutral room;
- room rendering follows session membership rather than portal role;
- observer controls are read-only;
- teacher role management, end/resume, rotation, archive, and restore surface
  backend errors without optimistic state drift; and
- navigation deduplicates `/sessions` across users with multiple organization
  roles.

### End-to-end acceptance

A Playwright scenario uses separate authenticated browser contexts to prove:

1. User A creates a session and shares its code.
2. User B joins with the code and edits collaboratively.
3. User A changes User B to observer and User B loses write access.
4. User A promotes User B to teacher and teaching controls become available.
5. A run ends and a new run resumes with the same content and memberships.
6. User A rotates credentials; an old link fails for User C and the new link
   succeeds.
7. User A archives the session; existing members see read-only content and new
   joins fail.
8. User A restores it, generates fresh credentials, and starts another run.

Before review, the branch must pass the full Go suite, Vitest suite, TypeScript
check, lint, and Playwright suite described by the repository workflow.

## Non-goals

- Anonymous joining.
- Public session discovery or public visibility controls.
- Email or SMS invitation delivery.
- Transfer of session ownership.
- Global replacement of organization/class administration roles.
- Per-run copies of the collaborative document; session content is
  intentionally persistent across runs.
- Recording or playback.
