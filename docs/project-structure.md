# Project Structure

## Directory Map

| Path | What it is |
|------|------------|
| `src/` | Next.js 16 App Router frontend + legacy TypeScript API routes |
| `platform/` | Go backend (API server, LLM/agent/sandbox layers, stores) |
| `server/hocuspocus.ts` | Yjs collaboration server |
| `e2e/` | Playwright E2E tests |
| `tests/` | Vitest unit + integration tests |
| `drizzle/` | Drizzle migration files |
| `docs/` | Documentation |
| `docs/plans/` | Executed implementation plans (numbered `NNN-feature-name.md`; sub-docs use letter suffixes `021a`, `021b`) |
| `docs/specs/` | Design specs for large or novel features |

## Service Ports

| Service | Default port | Override env var | Notes |
|---------|------|------|-------|
| Next.js | 3003 | `NEXTJS_PORT` | Frontend; proxies Go routes via `next.config.ts` rewrites (`GO_PROXY_ROUTES`) |
| Go platform | 8002 | `GO_PORT` | API server |
| Hocuspocus | 4000 | `HOCUSPOCUS_PORT` | Yjs collaboration |

All three services must be running for E2E tests.

Ports are configurable via `.env` (see the override env vars above). When you
change a port, update the matching URL var so services still find each other:
`NEXTJS_PORT` ↔ `NEXTAUTH_URL`; `GO_PORT` ↔ `GO_INTERNAL_API_URL` / `GO_API_URL`;
`HOCUSPOCUS_PORT` ↔ `NEXT_PUBLIC_HOCUSPOCUS_URL`.

## Running the Services

| Service | Command |
|---------|---------|
| **All three at once** | `bun run dev:all` (parallel, prefixed output; Go via `go run`) |
| Next.js dev | `bun run dev` (port from `NEXTJS_PORT`, default 3003) |
| Go platform (manual) | `bun run dev:go` — or `cd platform && go run ./cmd/api/` |
| Go platform (hot-reload) | `cd platform && air` (or `make dev`) |
| Hocuspocus | `bun run hocuspocus` |
| DB studio | `bun run db:studio` |

`dev:all` is the quickest start; it runs all three services in one terminal
with Foreman-style prefixed logs and shuts them all down on Ctrl+C. It uses
`go run` for the Go API (no hot-reload) — run `air` / `make dev` in a separate
terminal when you want Go to rebuild on save.

Full dev setup (PostgreSQL, env vars, auth, migrations) lives in `docs/setup.md`.
