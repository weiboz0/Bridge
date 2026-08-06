import { api } from "@/lib/api-client";
import { ApiError } from "@/lib/api-error";
import { getPortalConfig } from "@/lib/portal/nav-config";
import { Sidebar } from "./sidebar";
import { IdentityDriftBanner } from "./identity-drift-banner";
import { redirect } from "next/navigation";
import type { PortalRole, UserRole } from "@/lib/portal/types";

interface PortalAccessResponse {
  authorized: boolean;
  // True whenever the caller holds a valid session, regardless of roles. The
  // role-neutral shell (portalRole===null) admits on this; role-specific shells
  // keep gating on `authorized`. See handlers/me.go GetPortalAccess (plan 090).
  authenticated: boolean;
  userName: string;
  roles: UserRole[];
}

interface PortalShellProps {
  // When null, the shell accepts any authenticated user with ≥1 portal role
  // (Decision #13, plan 089 phase 1). Pass a specific PortalRole to gate
  // access to users who hold that role.
  portalRole: PortalRole | null;
  children: React.ReactNode;
}

export async function PortalShell({ portalRole, children }: PortalShellProps) {
  // Plan 040 phase 5: middleware (`src/middleware.ts` + the `authorized`
  // callback in `src/lib/auth.ts`) handles unauthenticated portal access
  // — redirects to /login?callbackUrl=<original> before this component
  // ever renders. The fallbacks below stay as defense-in-depth for the
  // unlikely case middleware didn't run; they redirect to /login with no
  // callbackUrl because by the time we're here the original URL is no
  // longer trivially recoverable from the server-component context.

  let data: PortalAccessResponse;
  try {
    data = await api<PortalAccessResponse>("/api/me/portal-access");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      redirect("/login");
    }
    throw e; // surface infrastructure errors
  }

  // Truly unauthenticated callers are bounced regardless of subtree. (Middleware
  // normally handles this first; this is defense-in-depth.)
  if (!data.authenticated) {
    redirect("/login");
  }

  // Role-neutral shell (portalRole===null, plan 090): admit ANY authenticated
  // user, including zero-role ones, so they can reach /sessions. Pages under a
  // neutral layout that need more than authentication (e.g. the library pages)
  // enforce their own `authorized` gate.
  //
  // Role-specific shell: behavior preserved exactly — a roleless user is still
  // bounced to /login, and a user lacking the specific role goes to "/".
  if (portalRole !== null) {
    if (!data.authorized) {
      redirect("/login");
    }

    const hasRole = data.roles.some((r) => r.role === portalRole);
    if (!hasRole) {
      redirect("/");
    }

    const config = getPortalConfig(portalRole);
    if (!config) {
      redirect("/");
    }
  }

  // When role-neutral (portalRole===null), use the first role for sidebar
  // currentRole so the prop stays populated (kept for backward compat).
  const currentRole: PortalRole = portalRole ?? data.roles[0]?.role ?? "student";

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={data.userName || "User"}
        roles={data.roles}
        currentRole={currentRole}
      />
      <main className="flex-1 min-h-screen pb-16 md:pb-0">
        <IdentityDriftBanner />
        {children}
      </main>
    </div>
  );
}
