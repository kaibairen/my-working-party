import { join } from "node:path";
import { drainReadyGates, expect, seedAuthorityReady, shotDir, test } from "./helpers";

test.describe("M2/M3 ops + outbox", () => {
  test("ops_shows_outbox_delivery", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedAuthorityReady(baseURL!);
    await page.goto("/ops");
    await expect(page.locator("h1")).toContainText(/Outbox|Health/);
    await expect(page.getByTestId("outbox-table")).toBeVisible();
    await expect(page.locator("#outbox-summary")).toContainText(/pending|published/);
    await expect(page.locator("#health")).toContainText("schema_version");
    await page.screenshot({ path: join(shotDir, "ops_outbox_delivery.png"), fullPage: true });
  });
});
