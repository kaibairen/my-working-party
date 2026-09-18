import { expect, test } from "@playwright/test";
import { openInbox } from "./helpers";

/** E2E-20 */
test("card_renders_missing_array", async ({ page }) => {
  await openInbox(page);
  const card = page.locator('[data-gate-id="gin_01k8q2m0deliver"]');
  const items = card.getByTestId("missing-item");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText("ci_check:e2e");
  await expect(items.nth(1)).toHaveText("screenshot:mobile");
});

/** E2E-21 */
test("missing_empty_still_shows_ready_ok", async ({ page }) => {
  await openInbox(page);
  const card = page.locator('[data-gate-id="gin_01k8q3safety"]');
  await expect(card.getByTestId("gate-status")).toHaveText("ready");
  await expect(card.getByTestId("missing-block")).toBeVisible();
  await expect(card.getByTestId("missing-item")).toHaveCount(0);
  await expect(card.getByTestId("missing-none")).toContainText("Predicate satisfied");
});
