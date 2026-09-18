import { expect, type Page } from "@playwright/test";

export async function openInbox(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.removeItem("bh.gate-inbox.mock.v1");
    localStorage.setItem("bh.gate-inbox.source", "mock");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gate Inbox" })).toBeVisible();
}

export async function lastDecide(page: Page) {
  return page.evaluate(() => {
    const probe = window.__lastGateDecide;
    if (!probe) throw new Error("no decide probe");
    return probe;
  });
}
