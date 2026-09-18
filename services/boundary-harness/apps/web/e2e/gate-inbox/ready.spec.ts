import { expect, test } from "@playwright/test";
import { openInbox } from "./helpers";

test("inbox_lists_only_ready", async ({ page }) => {
  await openInbox(page);
  const cards = page.getByTestId("gate-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId("gate-status")).toHaveCount(2);
  for (const status of await page.getByTestId("gate-status").all()) {
    await expect(status).toHaveText("ready");
  }
  await expect(page.locator('[data-gate-id="gin_pending_must_not_list"]')).toHaveCount(0);
  await expect(page.getByText("Should never appear in Inbox")).toHaveCount(0);
});

test("inbox_empty_state_quiet", async ({ page }) => {
  await openInbox(page);
  const initial = await page.getByTestId("gate-card").count();
  for (let i = 0; i < initial; i++) {
    const remaining = await page.getByTestId("gate-card").count();
    await page.getByTestId("decide-pass").first().click();
    await expect(page.getByTestId("gate-card")).toHaveCount(remaining - 1);
  }
  await expect(page.getByTestId("empty-inbox")).toBeVisible();
  await expect(page.getByTestId("empty-inbox")).toContainText("All quiet");
  await expect(page.getByTestId("empty-inbox")).toContainText("No ready gates");
  const empty = (await page.getByTestId("empty-inbox").innerText()).toLowerCase();
  expect(empty).not.toMatch(/canvas|roster|timeline|progress|open the board/);
});

test("inbox_card_shows_predicate_meta", async ({ page }) => {
  await openInbox(page);
  const first = page.getByTestId("gate-card").first();
  await expect(first.getByTestId("predicate-id")).toHaveText("deliver_ready_v1");
  await expect(first.getByTestId("predicate-version")).toHaveText("1");
  await expect(first.getByTestId("ready-at")).not.toHaveText("—");
  await expect(first.getByTestId("gate-version")).toHaveText("v12");
});
