import { PortalShell } from "@/components/portal/portal-shell";

// Role-neutral layout: ANY authenticated user, regardless of portal role, can
// reach /sessions — plan 090 Decisions #8/#9. Any registered user may host an
// ad-hoc (class-less) session, browse public ones, or join by link. Mirrors
// the /library role-neutral layout pattern from plan 089.
export default function SessionsLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portalRole={null}>{children}</PortalShell>;
}
