import { join } from "node:path";
import {
  RUN_GREEN_PASS_RE,
  VERBAL_DONE_RE,
  api,
  drainReadyGates,
  expect,
  headers,
  seedDeliverReady,
  seedExploreNoGate,
  shotDir,
  test,
} from "./helpers";

test.describe("E2E reject verbal-done", () => {
  test("no_mark_done_button", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(VERBAL_DONE_RE);
    await expect(page.getByRole("button", { name: /mark done|标记完成|我确认好了/i })).toHaveCount(0);
    await expect(page.getByTestId("decide-pass")).toBeVisible();
    await expect(page.getByTestId("decide-revise")).toBeVisible();
    await expect(page.getByTestId("decide-defer")).toBeVisible();
    await page.screenshot({ path: join(shotDir, "e2e30_no_mark_done_button.png"), fullPage: true });
  });

  test("chat_done_text_never_creates_card", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedExploreNoGate(baseURL!);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-empty")).toBeVisible();

    await api(baseURL!, "/v1/policy/check", {
      method: "POST",
      headers: headers.executor,
      body: JSON.stringify({
        action: "chat_done",
        track: "advisory_hint",
        context: { text: "done", verbal: true },
      }),
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("chat.done", { detail: { text: "done" } }));
      window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "chat.done", text: "我确认好了" }) }));
    });
    await page.reload();
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await expect(page.getByTestId("gate-card")).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "e2e31_chat_done_never_creates_card.png"), fullPage: true });
  });

  test("run_succeeded_banner_not_decide", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const seeded = await seedExploreNoGate(baseURL!);
    expect(seeded.run.status).toBe("succeeded");

    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(RUN_GREEN_PASS_RE);
    expect(body).not.toContain("Run 绿了直接通过");
    await expect(page.getByRole("button", { name: /pass because run|直接通过/i })).toHaveCount(0);
    await expect(page.getByTestId("decide-pass")).toHaveCount(0);
    await expect(page.getByTestId("gate-card")).toHaveCount(0);
    await page.screenshot({ path: join(shotDir, "e2e32_run_succeeded_banner_not_decide.png"), fullPage: true });
  });
});
