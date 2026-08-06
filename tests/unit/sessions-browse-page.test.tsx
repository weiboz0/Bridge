// @vitest-environment jsdom
//
// Plan 090 phase 5 — /sessions browse page (SessionsBrowsePage). Renders a
// directory of public live sessions from GET /api/sessions/public, with a
// "Start a session" affordance available to any authenticated user, and an
// empty state when there are none. Pattern mirrors library-page.test.tsx
// (plan 089).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  api: vi.fn(),
}));

class RedirectError extends Error {
  constructor(public destination: string) {
    super(`NEXT_REDIRECT: ${destination}`);
    this.name = "RedirectError";
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// StartSessionButton is a "use client" component with its own useRouter/
// fetch wiring — irrelevant to this page's rendering/data-fetch logic, so
// stub it (same approach library-page.test.tsx uses for its create trigger).
vi.mock("@/components/teacher/start-session-button", () => ({
  StartSessionButton: ({ mode }: { mode?: string }) => (
    <button data-testid="start-session-button" data-mode={mode ?? "class"}>
      Start Session
    </button>
  ),
}));

import SessionsBrowsePage from "@/app/(portal)/sessions/page";
import { api } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { redirect } from "next/navigation";

const mockedApi = vi.mocked(api);
const mockedRedirect = vi.mocked(redirect);

async function renderPage() {
  const element = await SessionsBrowsePage();
  render(element as React.ReactElement);
}

beforeEach(() => {
  mockedApi.mockReset();
  mockedRedirect.mockReset();
});

describe("SessionsBrowsePage — plan 090 phase 5", () => {
  it("renders a list of public sessions with title, host, count, started-at, and a Join link", async () => {
    mockedApi.mockResolvedValueOnce({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Study Hall",
          hostName: "Alex Host",
          participantCount: 3,
          startedAt: "2026-08-06T10:00:00Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Office Hours",
          hostName: "Jamie Teach",
          participantCount: 0,
          startedAt: "2026-08-06T09:00:00Z",
        },
      ],
    });

    await renderPage();

    expect(screen.getByText("Study Hall")).toBeInTheDocument();
    expect(screen.getByText(/Alex Host/)).toBeInTheDocument();
    expect(screen.getByText(/3 participants/)).toBeInTheDocument();
    expect(screen.getByText("Office Hours")).toBeInTheDocument();
    expect(screen.getByText(/Jamie Teach/)).toBeInTheDocument();
    expect(screen.getByText(/0 participants/)).toBeInTheDocument();

    const joinLinks = screen.getAllByRole("link", { name: "Join" });
    expect(joinLinks).toHaveLength(2);
    expect(joinLinks[0]).toHaveAttribute(
      "href",
      "/sessions/11111111-1111-4111-8111-111111111111"
    );
    expect(joinLinks[1]).toHaveAttribute(
      "href",
      "/sessions/22222222-2222-4222-8222-222222222222"
    );
  });

  it("renders the Start a session control (mode=orphan) for any user", async () => {
    mockedApi.mockResolvedValueOnce({ items: [] });
    await renderPage();
    const startButton = screen.getByTestId("start-session-button");
    expect(startButton).toBeInTheDocument();
    expect(startButton).toHaveAttribute("data-mode", "orphan");
  });

  it("shows an empty state when there are no public sessions", async () => {
    mockedApi.mockResolvedValueOnce({ items: [] });
    await renderPage();
    expect(screen.getByText(/No public sessions right now/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Join" })).not.toBeInTheDocument();
  });

  it("renders the empty state (not a crash) on a non-401 API failure", async () => {
    mockedApi.mockRejectedValueOnce(new ApiError(500, "Database error"));
    await renderPage();
    expect(screen.getByText(/No public sessions right now/i)).toBeInTheDocument();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login on 401", async () => {
    mockedApi.mockRejectedValueOnce(new ApiError(401, "Unauthorized"));
    await expect(SessionsBrowsePage()).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });
});
