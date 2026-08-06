// @vitest-environment jsdom
//
// Plan 090 phase 5 — TeacherHeader visibility toggle. Host-only: the
// control self-determines "is this viewer the host" via a GET
// /api/sessions/{id} fetch (TeacherHeader is also mounted for a
// class-bound session's instructor/TA, who is authorized to view the
// dashboard but NOT to PATCH visibility — backend `isSessionOwner` is
// host/admin-only).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const HOST_USER_ID = "host-1";
const OTHER_USER_ID = "instructor-2";

let mockUserId = HOST_USER_ID;
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: mockUserId, isPlatformAdmin: false } } }),
}));

import { TeacherHeader } from "@/components/session/teacher/teacher-header";

const SESSION_ID = "sess-1";

function noop() {}

function renderHeader() {
  render(
    <TeacherHeader
      sessionId={SESSION_ID}
      studentCount={2}
      inviteToken={null}
      inviteExpiresAt={null}
      onEndSession={noop}
      onToggleLeft={noop}
      onToggleRight={noop}
      leftVisible
      rightVisible
    />
  );
}

describe("TeacherHeader — visibility toggle (plan 090 phase 5)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUserId = HOST_USER_ID;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders for the host and PATCHes the chosen visibility on click", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === `/api/sessions/${SESSION_ID}` && !init) {
        return new Response(
          JSON.stringify({ id: SESSION_ID, teacherId: HOST_USER_ID, visibility: "unlisted" }),
          { status: 200 }
        );
      }
      if (url === `/api/sessions/${SESSION_ID}` && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({ id: SESSION_ID, teacherId: HOST_USER_ID, visibility: "public" }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    renderHeader();

    const toggle = await screen.findByTestId("visibility-toggle");
    expect(toggle).toHaveTextContent("List publicly");

    fireEvent.click(toggle);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call) => call[1]?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
    });

    const patchCall = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH")!;
    expect(patchCall[0]).toBe(`/api/sessions/${SESSION_ID}`);
    expect(JSON.parse(patchCall[1]!.body as string)).toEqual({ visibility: "public" });

    await waitFor(() => {
      expect(screen.getByTestId("visibility-toggle")).toHaveTextContent("Public");
    });
  });

  it("does not render the toggle for a non-host viewer (e.g. class instructor/TA)", async () => {
    mockUserId = OTHER_USER_ID;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: SESSION_ID, teacherId: HOST_USER_ID, visibility: "unlisted" }),
        { status: 200 }
      )
    );

    renderHeader();

    // Let the GET resolve.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("visibility-toggle")).not.toBeInTheDocument();
  });
});
