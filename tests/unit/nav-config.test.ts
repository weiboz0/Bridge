import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { portalConfigs, getPortalConfig, withSessionsNavItem } from "@/lib/portal/nav-config";

describe("nav-config", () => {
  it("has configs for all 5 portals", () => {
    expect(Object.keys(portalConfigs)).toHaveLength(5);
    expect(portalConfigs.admin).toBeDefined();
    expect(portalConfigs.org_admin).toBeDefined();
    expect(portalConfigs.teacher).toBeDefined();
    expect(portalConfigs.student).toBeDefined();
    expect(portalConfigs.parent).toBeDefined();
  });

  // Plan 040 phase 7: parent nav has only Dashboard until a real
  // children list view ships. The previous /parent/children redirect-only
  // entry was a phantom nav item and is removed.
  // Plan 090 phase 5: parent additionally gets the role-neutral "Sessions"
  // entry (Decision 9) — still no /parent/children.
  it("parent nav has Dashboard and Sessions only", () => {
    expect(portalConfigs.parent.navItems).toHaveLength(2);
    expect(portalConfigs.parent.navItems[0].href).toBe("/parent");
    expect(portalConfigs.parent.navItems[1].href).toBe("/sessions");
  });

  // Plan 083: Schedule and Reports are not real teacher product surfaces
  // yet. Keep them out of primary nav until a real MVP ships.
  it("teacher nav does not link to schedule or reports placeholders", () => {
    const teacherHrefs = portalConfigs.teacher.navItems.map((item) => item.href);

    expect(teacherHrefs).not.toContain("/teacher/schedule");
    expect(teacherHrefs).not.toContain("/teacher/reports");
  });

  // Plan 041 phase 3.1: every org_admin nav entry must have a backing
  // page file. Catches the "added a nav link, forgot the page" mistake.
  // Plan 043 phase 6.4: extended to cover the admin portal too.
  it.each(["org_admin", "admin"] as const)(
    "every %s nav item has a matching page file",
    (portalRole) => {
      const repoRoot = path.resolve(__dirname, "..", "..");
      for (const item of portalConfigs[portalRole].navItems) {
        const relPath = item.href.replace(/^\//, "");
        const pagePath = path.join(repoRoot, "src", "app", "(portal)", relPath, "page.tsx");
        expect(
          fs.existsSync(pagePath),
          `${portalRole} nav item "${item.label}" -> ${item.href} has no page file at ${pagePath}`
        ).toBe(true);
      }
    }
  );

  it("every nav item has a valid href starting with /", () => {
    for (const config of Object.values(portalConfigs)) {
      for (const item of config.navItems) {
        expect(item.href).toMatch(/^\//);
      }
    }
  });

  it("every nav item has a non-empty icon", () => {
    for (const config of Object.values(portalConfigs)) {
      for (const item of config.navItems) {
        expect(item.icon.length).toBeGreaterThan(0);
      }
    }
  });

  it("every nav item has a non-empty label", () => {
    for (const config of Object.values(portalConfigs)) {
      for (const item of config.navItems) {
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("getPortalConfig returns config for valid role", () => {
    const config = getPortalConfig("teacher");
    expect(config).not.toBeNull();
    expect(config!.role).toBe("teacher");
  });

  it("getPortalConfig returns null for invalid role", () => {
    expect(getPortalConfig("invalid")).toBeNull();
  });

  // Review-002 P1 #5: org-admin nav linked into /teacher/* which redirected
  // back to /org for org admins without the teacher role. Lock the rule:
  // each portal's nav stays inside its own basePath. The single intentional
  // cross-portal link is org_admin → /teacher/* (allowed if a user holds
  // both roles), which we now want to forbid by default and only re-add
  // through an explicit allow-list when org-scoped views ship.
  it("no nav item points outside its own portal's basePath", () => {
    // Other-portal prefixes that any given config is forbidden from linking to.
    const allBasePaths: Record<string, string[]> = {
      admin: ["/org", "/teacher", "/student", "/parent"],
      org_admin: ["/admin", "/teacher", "/student", "/parent"],
      teacher: ["/admin", "/org", "/student", "/parent"],
      student: ["/admin", "/org", "/teacher", "/parent"],
      parent: ["/admin", "/org", "/teacher", "/student"],
    };
    for (const [role, config] of Object.entries(portalConfigs)) {
      const forbidden = allBasePaths[role] ?? [];
      for (const item of config.navItems) {
        for (const pfx of forbidden) {
          expect(
            item.href.startsWith(pfx + "/") || item.href === pfx,
            `${role} nav item "${item.label}" → ${item.href} crosses into ${pfx}`
          ).toBe(false);
        }
      }
    }
  });

  // Plan 090 phase 5, Decision 9 — every portal role gets a "Sessions" entry
  // pointing at the role-neutral /sessions hub. withSessionsNavItem() in
  // nav-config.ts is idempotent by href OR label, so a role that already
  // has an equivalent entry (teacher's own /teacher/sessions) never ends
  // up with two "Sessions"-labeled items, and a role with none gets the
  // neutral href added exactly once — even if the helper runs again.
  describe("Sessions nav entry (plan 090)", () => {
    it("every role config has exactly one 'Sessions'-labeled entry", () => {
      for (const [role, config] of Object.entries(portalConfigs)) {
        const matches = config.navItems.filter((item) => item.label === "Sessions");
        expect(matches, `${role} nav should have exactly one Sessions entry`).toHaveLength(1);
      }
    });

    it("adds the neutral /sessions href for roles without an existing Sessions entry", () => {
      for (const [role, config] of Object.entries(portalConfigs)) {
        if (role === "teacher") continue; // asserted separately below
        const sessionsItem = config.navItems.find((item) => item.label === "Sessions");
        expect(sessionsItem?.href, `${role} Sessions entry`).toBe("/sessions");
      }
    });

    it("teacher keeps its existing /teacher/sessions entry instead of a duplicate 'Sessions' label", () => {
      const sessionsItems = portalConfigs.teacher.navItems.filter(
        (item) => item.label === "Sessions"
      );
      expect(sessionsItems).toHaveLength(1);
      expect(sessionsItems[0].href).toBe("/teacher/sessions");
    });

    it("withSessionsNavItem is idempotent — running it again never adds a second Sessions entry", () => {
      for (const config of Object.values(portalConfigs)) {
        // config.navItems already went through withSessionsNavItem once (at
        // module load). Run it again, simulating "already present" / a
        // second invocation, and confirm the count doesn't change.
        const before = config.navItems.filter((item) => item.label === "Sessions").length;
        const ranTwice = withSessionsNavItem(config.navItems);
        const after = ranTwice.filter((item) => item.label === "Sessions").length;
        expect(after).toBe(before);
        expect(after).toBe(1);
        expect(ranTwice).toHaveLength(config.navItems.length);
      }
    });

    it("withSessionsNavItem adds the entry to a fresh array missing it", () => {
      const before = [{ label: "Dashboard", href: "/x", icon: "layout-dashboard" }];
      const after = withSessionsNavItem(before);
      expect(after).toHaveLength(2);
      expect(after[1]).toEqual({ label: "Sessions", href: "/sessions", icon: "video" });
    });

    it("withSessionsNavItem skips a role that already has a 'Sessions'-labeled entry with a different href", () => {
      const before = [{ label: "Sessions", href: "/teacher/sessions", icon: "video" }];
      const after = withSessionsNavItem(before);
      expect(after).toEqual(before);
    });
  });
});
