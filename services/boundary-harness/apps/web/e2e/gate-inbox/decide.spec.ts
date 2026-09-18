import { expect, test } from "@playwright/test";
import { lastDecide, openInbox } from "./helpers";

test("decide_pass_uses_version", async ({ page }) => {
  await openInbox(page);
  const card = page.locator('[data-gate-id="gin_01k8q2m0deliver"]');
  await card.getByTestId("decide-pass").click();
  const payload = await lastDecide(page);
  expect(payload.id).toBe("gin_01k8q2m0deliver");
  expect(payload.body.decision).toBe("pass");
  expect(payload.body.version).toBe(12);
  expect(payload.body).not.toHaveProperty("expected_version");
  await expect(page.locator('[data-gate-id="gin_01k8q2m0deliver"]')).toHaveCount(0);
});

test("decide_revise_default_same_assignment", async ({ page }) => {
  await openInbox(page);
  const card = page.locator('[data-gate-id="gin_01k8q2m0deliver"]');
  await expect(card.getByTestId("structural-change")).not.toBeChecked();
  await card.getByTestId("decide-revise").click();
  const payload = await lastDecide(page);
  expect(payload.body.decision).toBe("revise");
  expect(payload.body.version).toBe(12);
  expect(payload.body.structural_change).toBe(false);
  expect(payload.body).not.toHaveProperty("expected_version");
});

test("decide_optimistic_lock_409_refresh", async ({ page }) => {
  await openInbox(page);
  const card = page.locator('[data-gate-id="gin_01k8q2m0deliver"]');
  await card.getByTestId("arm-409").click();
  await card.getByTestId("decide-pass").click();
  await expect(card.getByTestId("lock-banner")).toBeVisible();
  await expect(card.getByTestId("lock-banner")).toContainText("409");
  await expect(card.getByTestId("lock-banner")).toContainText("not retried");
  await expect(card.getByTestId("gate-version")).toHaveText("v13");
  await expect(card).toHaveCount(1);
  const payload = await lastDecide(page);
  expect(payload.body.version).toBe(12);
});
