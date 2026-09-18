import { expect, test } from "@playwright/test";
import { cloneDomainStore, openInboxApi } from "./domain-stub";

const DELIVER = "gin_01k8q2m0deliver";

/** E2E-10 */
test("decide_pass_uses_version", async ({ page }) => {
  const store = cloneDomainStore();
  const captured = await openInboxApi(page, store);
  await page.locator(`[data-gate-id="${DELIVER}"]`).getByTestId("decide-pass").click();

  await expect.poll(() => captured.decides.length).toBe(1);
  const req = captured.decides[0];
  expect(req.id).toBe(DELIVER);
  expect(req.body.decision).toBe("pass");
  expect(req.body.version).toBe(12);
  expect(req.body).not.toHaveProperty("expected_version");
  await expect(page.locator(`[data-gate-id="${DELIVER}"]`)).toHaveCount(0);
});

/** E2E-11 */
test("decide_revise_default_same_assignment", async ({ page }) => {
  const store = cloneDomainStore();
  const captured = await openInboxApi(page, store);
  const card = page.locator(`[data-gate-id="${DELIVER}"]`);
  await expect(card.getByTestId("structural-change")).not.toBeChecked();
  await card.getByTestId("decide-revise").click();

  await expect.poll(() => captured.decides.length).toBe(1);
  expect(captured.decides[0].body.decision).toBe("revise");
  expect(captured.decides[0].body.version).toBe(12);
  expect(captured.decides[0].body.structural_change).toBe(false);
  expect(captured.decides[0].body).not.toHaveProperty("expected_version");
  await expect(card).toHaveCount(0);
});

/** E2E-12 */
test("decide_optimistic_lock_409_refresh", async ({ page }) => {
  const store = cloneDomainStore();
  const captured = await openInboxApi(page, store);
  const card = page.locator(`[data-gate-id="${DELIVER}"]`);
  await expect(card.getByTestId("gate-version")).toHaveText("v12");

  const row = store.find((g) => g.id === DELIVER);
  if (!row) throw new Error("missing deliver fixture");
  row.version = 13;

  await card.getByTestId("decide-pass").click();
  await expect(card.getByTestId("lock-banner")).toBeVisible();
  await expect(card.getByTestId("lock-banner")).toContainText("409");
  await expect(card.getByTestId("lock-banner")).toContainText("not retried");
  await expect(card.getByTestId("gate-version")).toHaveText("v13");
  await expect(card).toHaveCount(1);
  expect(captured.decides).toHaveLength(1);
  expect(captured.decides[0].body.version).toBe(12);
  expect(captured.decides[0].body).not.toHaveProperty("expected_version");
});
