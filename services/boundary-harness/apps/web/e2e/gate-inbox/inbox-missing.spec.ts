import { join } from "node:path";
import {
  MISSING_EVIDENCE_FAKE_RE,
  PLEASE_APPROVE_ONLY_RE,
  drainReadyGates,
  expect,
  seedAuthorityReady,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

test.describe("E2E missing[]", () => {
  test("card_renders_missing_array", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const seeded = await seedAuthorityReady(baseURL!);
    const missing = seeded.gate?.ready_result?.missing ?? [];
    expect(missing.length).toBeGreaterThan(0);

    await page.goto("/inbox");
    const items = page.getByTestId("missing-item");
    await expect(items).toHaveCount(missing.length);
    for (const entry of missing) {
      await expect(page.getByTestId("missing-item").filter({ hasText: entry })).toHaveCount(1);
    }
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/^\s*请批准\s*$/m);
    if (PLEASE_APPROVE_ONLY_RE.test(body)) {
      expect(body).toMatch(/authority_escalation:/);
    }
    await expect(page.getByTestId("decide-pass")).toBeVisible();
    await page.screenshot({ path: join(shotDir, "e2e20_card_renders_missing_array.png"), fullPage: true });
  });

  test("missing_empty_still_shows_ready_ok", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    expect(ready.gate?.ready_result?.ok).toBe(true);
    expect(ready.gate?.ready_result?.missing ?? []).toEqual([]);

    await page.goto("/inbox");
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    await expect(page.getByTestId("missing-item")).toHaveCount(0);
    await expect(page.getByText("还不能过，缺这些")).toHaveCount(0);
    await expect(page.getByTestId("decide-pass")).toBeEnabled();
    await expect(page.getByTestId("decide-revise")).toBeEnabled();
    await expect(page.getByTestId("decide-defer")).toBeEnabled();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(MISSING_EVIDENCE_FAKE_RE);
    await page.screenshot({ path: join(shotDir, "e2e21_missing_empty_ready_ok.png"), fullPage: true });
  });
});
