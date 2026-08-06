import { test, expect } from "@playwright/test";
import { ACCOUNTS, loginWithCredentials } from "./helpers";

/**
 * Plan 090 Phase 6 — role-neutral ad-hoc sessions, end to end.
 *
 * Covers host -> make public -> browse -> join on a class-less session:
 *  1. A teacher (any authenticated user would do; teacher is a seeded,
 *     convenient account) starts an ad-hoc session from /sessions and lands
 *     in the neutral room at /sessions/{id}.
 *  2. The host makes it public via the visibility toggle.
 *  3. A second, different user sees it in the /sessions browse list and joins,
 *     landing in the same /sessions/{id} room as a participant.
 *
 * NOTE: like every Bridge E2E spec this needs all three services up and a
 * pinned E2E_BASE_URL (playwright.config.ts has no webServer and its seed
 * fixture mutates data — see docs/testing.md). It has NOT been executed
 * against a live stack in this environment; it is written to the existing
 * session-spec pattern and verified collectable via `playwright test --list`.
 */
test.describe("ad-hoc sessions", () => {
  test("host makes a class-less session public; another user browses and joins", async ({
    browser,
  }) => {
    // ── Host: start an ad-hoc session from the neutral browse page ──────────
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await loginWithCredentials(host, ACCOUNTS.teacher.email, ACCOUNTS.teacher.password);

    await host.goto("/sessions");
    await host.getByRole("button", { name: /start a session/i }).click();

    // Class-less host is routed to the role-neutral room, not /teacher/sessions.
    await host.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionId = host.url().split("/sessions/")[1];
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);

    // ── Host: publish it via the visibility toggle ──────────────────────────
    await host.getByTestId("visibility-toggle").click();
    await expect(host.getByTestId("visibility-toggle")).toContainText(/public/i);

    // ── Joiner: a different user finds it in the browse list and joins ──────
    const joinCtx = await browser.newContext();
    const joiner = await joinCtx.newPage();
    await loginWithCredentials(joiner, ACCOUNTS.student2.email, ACCOUNTS.student2.password);

    await joiner.goto("/sessions");
    const row = joiner.getByRole("link", { name: new RegExp(sessionId) }).first();
    await expect(row).toBeVisible();
    await row.click();

    // Joiner lands in the same neutral room as a participant.
    await joiner.waitForURL(new RegExp(`/sessions/${sessionId}$`));

    await hostCtx.close();
    await joinCtx.close();
  });
});
