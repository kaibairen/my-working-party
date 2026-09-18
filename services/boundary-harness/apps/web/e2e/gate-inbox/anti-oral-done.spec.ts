import { expect, test } from "@playwright/test";
import { openInbox } from "./helpers";

/** E2E-30 */
test("no_mark_done_button", async ({ page }) => {
  await openInbox(page);
  await expect(page.getByRole("button", { name: /mark done|标记完成|我确认好了/i })).toHaveCount(0);
  await expect(page.getByTestId("mark-done")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/mark done|标记完成|我确认好了/i);
});

/** E2E-31 */
test("chat_done_text_never_creates_card", async ({ page }) => {
  await openInbox(page);
  const before = await page.getByTestId("gate-card").count();
  await page.locator("textarea").first().fill("done");
  await page.locator("textarea").first().press("Enter");
  await page.evaluate(() => {
    window.__gateInboxTest?.emitChatDone();
  });
  await expect(page.getByRole("textbox", { name: /chat/i })).toHaveCount(0);
  await expect(page.getByTestId("gate-card")).toHaveCount(before);
});

/** E2E-32 */
test("run_succeeded_banner_not_decide", async ({ page }) => {
  await openInbox(page);
  await page.evaluate(() => {
    window.__gateInboxTest?.emitRunSucceeded("run_green");
  });
  const bypass = page.getByTestId("exception-run.succeeded");
  await expect(bypass).toBeVisible();
  await expect(bypass).toContainText(/succeeded/i);
  await expect(bypass).toContainText(/not a decide/i);
  await expect(bypass.getByTestId("decide-pass")).toHaveCount(0);
  await expect(bypass.getByRole("button", { name: /pass|直接通过/i })).toHaveCount(0);
  await expect(page.getByText(/run 绿了直接通过|mark done/i)).toHaveCount(0);
  await expect(page.getByTestId("decide-pass")).toHaveCount(2);
});
