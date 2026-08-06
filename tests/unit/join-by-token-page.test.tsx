// @vitest-environment jsdom
//
// Plan 090 phase 5 — /s/[token] redirect branching (Codex finding,
// Decision 8/Phase 5). Pre-090 a class-less join always replaced to
// /student/sessions/{id}. Now: class-less (classId: null in the join
// response) routes through the role-neutral /sessions/{id} room — the
// joiner may hold no student role at all. Class-bound joins are unchanged.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const replaceMock = vi.fn();
const pushMock = vi.fn();
// Stable object reference across renders — the page's join effect lists
// `router` in its dependency array, so a fresh object per call (as some
// simpler mocks elsewhere use) would re-trigger the effect on every
// re-render and double-fire the join fetch.
const routerMock = { replace: replaceMock, push: pushMock };
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-abc123" }),
  useRouter: () => routerMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

import JoinByTokenPage from "@/app/s/[token]/page";

describe("/s/[token] page — redirect branching (plan 090 phase 5)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceMock.mockReset();
    pushMock.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("class-less join (classId: null) replaces to /sessions/{sessionId}", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "sess-orphan-1", classId: null }), {
        status: 200,
      })
    );

    render(<JoinByTokenPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith("/sessions/sess-orphan-1");
  });

  it("class-bound join (classId present) keeps the /student/classes/.../session/... route", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ sessionId: "sess-class-1", classId: "class-42" }),
        { status: 200 }
      )
    );

    render(<JoinByTokenPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith(
      "/student/classes/class-42/session/sess-class-1"
    );
  });
});
