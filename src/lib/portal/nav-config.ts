import type { NavItem, PortalConfig } from "./types";

// Plan 090 Decision 9 — every portal role gets a "Sessions" entry pointing
// at the role-neutral /sessions hub (browse public live sessions + host an
// ad-hoc one, reachable by any authenticated user regardless of role).
//
// Idempotent by href OR label: if a role's navItems already contains an
// entry whose href is exactly "/sessions", or one already labeled
// "Sessions" pointing somewhere else, the insert is skipped rather than
// producing a duplicate. The teacher role already has "Sessions" ->
// /teacher/sessions (its own live-session dashboard) — that counts as the
// equivalent entry, so teachers do NOT also get a second "Sessions" label
// pointing at /sessions; the other four roles (none of which had any
// session-related nav item) get the neutral href added.
const SESSIONS_NAV_ITEM: NavItem = { label: "Sessions", href: "/sessions", icon: "video" };

export function withSessionsNavItem(navItems: NavItem[]): NavItem[] {
  const hasEquivalent = navItems.some(
    (item) => item.href === SESSIONS_NAV_ITEM.href || item.label === SESSIONS_NAV_ITEM.label
  );
  if (hasEquivalent) {
    return navItems;
  }
  return [...navItems, SESSIONS_NAV_ITEM];
}

export const portalConfigs: Record<string, PortalConfig> = {
  admin: {
    role: "admin",
    label: "Platform Admin",
    basePath: "/admin",
    // /admin/settings was a redirect-only placeholder; plan 043 phase 6.4
    // dropped it pending a real settings page design (matches the parent
    // /children precedent from plan 040 phase 7).
    navItems: withSessionsNavItem([
      { label: "Organizations", href: "/admin/orgs", icon: "building-2" },
      { label: "Users", href: "/admin/users", icon: "users" },
      { label: "Library", href: "/library", icon: "library" },
    ]),
  },
  org_admin: {
    role: "org_admin",
    label: "Organization",
    basePath: "/org",
    // Library is placed at index 1 (after Dashboard) so it survives the
    // mobile bottom-nav `slice(0, 4)` cut. Risk #2 in plan 089: at the
    // previous position (index 5) it dropped off mobile. Sessions (plan 090)
    // is placed right after it for the same reason.
    navItems: withSessionsNavItem([
      { label: "Dashboard", href: "/org", icon: "layout-dashboard" },
      { label: "Library", href: "/library", icon: "library" },
      { label: "Teachers", href: "/org/teachers", icon: "graduation-cap" },
      { label: "Students", href: "/org/students", icon: "users" },
      { label: "Courses", href: "/org/courses", icon: "book-open" },
      { label: "Classes", href: "/org/classes", icon: "school" },
      { label: "Parent links", href: "/org/parent-links", icon: "link" },
      { label: "Settings", href: "/org/settings", icon: "settings" },
    ]),
  },
  teacher: {
    role: "teacher",
    label: "Teacher",
    basePath: "/teacher",
    navItems: withSessionsNavItem([
      { label: "Dashboard", href: "/teacher", icon: "layout-dashboard" },
      { label: "Library", href: "/library", icon: "library" },
      { label: "Problems", href: "/teacher/problems", icon: "puzzle" },
      { label: "Sessions", href: "/teacher/sessions", icon: "video" },
      { label: "Courses", href: "/teacher/courses", icon: "book-open" },
      { label: "Classes", href: "/teacher/classes", icon: "school" },
    ]),
  },
  student: {
    role: "student",
    label: "Student",
    basePath: "/student",
    navItems: withSessionsNavItem([
      { label: "Dashboard", href: "/student", icon: "layout-dashboard" },
      { label: "My Classes", href: "/student/classes", icon: "school" },
      { label: "My Work", href: "/student/code", icon: "code" },
      { label: "Help", href: "/student/help", icon: "help-circle" },
    ]),
  },
  parent: {
    role: "parent",
    label: "Parent",
    basePath: "/parent",
    // /parent/children was a redirect-only entry; removed in plan 040
    // phase 7. A real children list view is product work that needs its
    // own design pass (deferred).
    navItems: withSessionsNavItem([
      { label: "Dashboard", href: "/parent", icon: "layout-dashboard" },
    ]),
  },
};

export function getPortalConfig(role: string): PortalConfig | null {
  return portalConfigs[role] || null;
}
