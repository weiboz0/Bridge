// @vitest-environment jsdom
//
// Plan 090 phase 4 — role-neutral admission.
//
// PortalAccessResponse now carries `authenticated` alongside `authorized`:
//   - authenticated: true whenever the caller holds a valid session, regardless of roles.
//   - authorized:    true only when the caller holds >=1 portal role (pre-existing meaning).
//
// Gate rules exercised (see src/components/portal/portal-shell.tsx):
//   1. Any caller with authenticated=false is bounced to /login, unconditionally
//      (covers both the 401-exception path and the in-body `authenticated: false` path).
//   2. Role-neutral shell (portalRole === null): admits ANY authenticated user,
//      including a zero-role (`authorized: false`) one. Never redirects an
//      authenticated caller.
//   3. Role-specific shell (portalRole === "<role>"):
//        - authorized=false (roleless) -> /login
//        - authorized=true but lacking the target role -> /
//        - authorized=true and holding the target role -> admitted

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// --- mocks ---------------------------------------------------------------

vi.mock("@/lib/api-client", () => ({ api: vi.fn() }));

// In Next.js, redirect() throws a special NEXT_REDIRECT error internally to
// halt rendering. Simulate that here so tests that assert redirect() was called
// don't need to worry about code running past the redirect call.
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

// Sidebar just needs to render something so we can assert children reached it.
vi.mock("@/components/portal/sidebar", () => ({
  Sidebar: ({ userName }: { userName: string }) => (
    <nav data-testid="sidebar">{userName}</nav>
  ),
}));

vi.mock("@/components/portal/identity-drift-banner", () => ({
  IdentityDriftBanner: () => null,
}));

// getPortalConfig must return something truthy for role-specific gates to pass.
vi.mock("@/lib/portal/nav-config", () => ({
  getPortalConfig: (role: string) =>
    role === "admin"
      ? { role: "admin", label: "Admin", basePath: "/admin", navItems: [] }
      : null,
}));

// -------------------------------------------------------------------------

import { PortalShell } from "@/components/portal/portal-shell";
import { ApiError } from "@/lib/api-error";
import { api } from "@/lib/api-client";
import { redirect } from "next/navigation";

const mockApi = vi.mocked(api);
const mockRedirect = vi.mocked(redirect);

const ADMIN_RESPONSE = {
  authorized: true,
  authenticated: true,
  userName: "Admin User",
  roles: [{ role: "admin" }],
};

const TEACHER_RESPONSE = {
  authorized: true,
  authenticated: true,
  userName: "Teacher User",
  roles: [{ role: "teacher", orgId: "org-1", orgName: "School A" }],
};

// Authenticated (has a valid session) but holds zero portal roles.
const AUTHENTICATED_ROLELESS_RESPONSE = {
  authorized: false,
  authenticated: true,
  userName: "New User",
  roles: [],
};

// Not authenticated at all — the in-body defense-in-depth path (middleware
// normally intercepts this before PortalShell ever renders).
const UNAUTHENTICATED_RESPONSE = {
  authorized: false,
  authenticated: false,
  userName: "",
  roles: [],
};

beforeEach(() => {
  mockApi.mockReset();
  mockRedirect.mockReset();
});

// -------------------------------------------------------------------------
// Role-neutral gate (portalRole === null) — plan 090 phase 4
// -------------------------------------------------------------------------

describe("PortalShell — role-neutral gate (portalRole=null)", () => {
  it("admits an authenticated user with zero roles — no redirect", async () => {
    mockApi.mockResolvedValue(AUTHENTICATED_ROLELESS_RESPONSE);
    const result = await PortalShell({
      portalRole: null,
      children: <p>neutral content</p>,
    });
    render(result as React.ReactElement);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("neutral content")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("admits an authenticated user holding a role — no redirect", async () => {
    mockApi.mockResolvedValue(TEACHER_RESPONSE);
    const result = await PortalShell({
      portalRole: null,
      children: <p>teacher content</p>,
    });
    render(result as React.ReactElement);
    expect(screen.getByText("teacher content")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated (authenticated=false in body)", async () => {
    mockApi.mockResolvedValue(UNAUTHENTICATED_RESPONSE);
    await expect(
      PortalShell({ portalRole: null, children: <p>neutral content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login on 401 (session missing entirely)", async () => {
    mockApi.mockRejectedValue(new ApiError(401, "Unauthorized"));
    await expect(
      PortalShell({ portalRole: null, children: <p>neutral content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});

// -------------------------------------------------------------------------
// Role-specific gate (portalRole = "<role>") — behaviour preserved exactly
// -------------------------------------------------------------------------

describe("PortalShell — role-specific gate (portalRole set)", () => {
  it("renders children and sidebar when user holds the required role", async () => {
    mockApi.mockResolvedValue(ADMIN_RESPONSE);
    const result = await PortalShell({
      portalRole: "admin",
      children: <p>admin content</p>,
    });
    render(result as React.ReactElement);
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("admin content")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to / when user is authorized but lacks the required role", async () => {
    mockApi.mockResolvedValue(TEACHER_RESPONSE);
    await expect(
      PortalShell({ portalRole: "admin", children: <p>admin content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("redirects to /login when the user is authenticated but roleless", async () => {
    mockApi.mockResolvedValue(AUTHENTICATED_ROLELESS_RESPONSE);
    await expect(
      PortalShell({ portalRole: "admin", children: <p>admin content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when not authenticated at all", async () => {
    mockApi.mockResolvedValue(UNAUTHENTICATED_RESPONSE);
    await expect(
      PortalShell({ portalRole: "admin", children: <p>admin content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login on 401", async () => {
    mockApi.mockRejectedValue(new ApiError(401, "Unauthorized"));
    await expect(
      PortalShell({ portalRole: "admin", children: <p>content</p> })
    ).rejects.toThrow("NEXT_REDIRECT: /login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
