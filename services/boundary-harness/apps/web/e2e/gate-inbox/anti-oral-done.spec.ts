import { expect, test } from "@playwright/test";
import { openInbox } from "./helpers";

test("no_mark_done_button", async ({ page }) => {
  await openInbox(page);
  await expect(page.getByRole("button", { name: /mark done/i })).toHaveCount(0);
  await expect(page.getByTestId("mark-done")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/mark done/i);
});

test("chat_done_text_never_creates_card", async ({ page }) => {
  await openInbox(page);
  const before = await page.getByTestId("gate-card").count();
  await page.locator("textarea").first().fill("done");
  await page.locator("textarea").first().press("Enter");
  await expect(page.getByRole("textbox", { name: /chat/i })).toHaveCount(0);
  await expect(page.getByTestId("gate-card")).toHaveCount(before);
});

test("run_succeeded_banner_not_decide", async ({ page }) => {
  await openInbox(page);
  await expect(page.getByText(/run succeeded/i)).toHaveCount(0);
  await expect(page.getByText(/agent idle/i)).toHaveCount(0);
  await expect(page.getByTestId("decide-pass")).toHaveCount(2);
  await expect(page.getByTestId("decide-revise")).toHaveCount(2);
  await expect(page.getByTestId("decide-defer")).toHaveCount(2);
});
