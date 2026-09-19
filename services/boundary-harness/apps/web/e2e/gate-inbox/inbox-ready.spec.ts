import { join } from "node:path";
import {
  CANVAS_CTA_RE,
  drainReadyGates,
  expect,
  seedDeliverPending,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

test.describe("E2E ready list", () => {
  test("inbox_lists_only_ready", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const pending = await seedDeliverPending(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    expect(pending.gate?.id).toBeTruthy();
    expect(ready.gate?.id).toBeTruthy();

    const gatesReq = page.waitForRequest((req) => {
      if (req.method() !== "GET") return false;
      const url = new URL(req.url());
      return url.pathname === "/v1/gates";
    });
    await page.goto("/inbox");
    const req = await gatesReq;
    const url = new URL(req.url());
    expect(url.pathname).toBe("/v1/gates");
    expect(url.searchParams.get("status")).toBe("ready");

    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    await expect(page.getByTestId("gate-id")).toHaveText(ready.gate!.id);
    await expect(page.getByTestId("gate-status")).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("gate-status")).toHaveText("硬门禁");
    await expect(page.getByTestId("gate-title")).not.toHaveText(ready.gate!.id);
    await expect(page.locator(`[data-testid="gate-card"][data-id="${pending.gate!.id}"]`)).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "e2e01_inbox_lists_only_ready.png"), fullPage: true });
  });

  test("inbox_empty_state_quiet", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await expect(page.getByTestId("inbox-empty")).toContainText("此刻没有需要你拍板的事");
    await expect(page.getByTestId("gate-card")).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(CANVAS_CTA_RE);
    expect(body).not.toContain("去画布看进度");
    await page.screenshot({ path: join(shotDir, "e2e02_inbox_empty_state_quiet.png"), fullPage: true });
  });

  test("inbox_card_shows_predicate_meta", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    const card = page.getByTestId("gate-card");
    await expect(card).toHaveCount(1);
    await expect(page.getByTestId("predicate-id")).toContainText(/predicate_id/);
    await expect(page.getByTestId("predicate-id")).toContainText(String(ready.gate?.predicate_id ?? "deliver_ready_v1"));
    await expect(page.getByTestId("predicate-version")).toContainText(/predicate_version/);
    await expect(page.getByTestId("predicate-version")).toContainText(String(ready.gate?.predicate_version ?? 1));
    await expect(page.getByTestId("ready-at")).toContainText(/ready_at/);
    await expect(page.getByTestId("ready-at")).not.toHaveText(/ready_at\s*$/);
    await page.screenshot({ path: join(shotDir, "e2e03_inbox_card_predicate_meta.png"), fullPage: true });
  });
});
