import { join } from "node:path";
import { confirmPass, drainReadyGates, expect, HUMAN_GOAL, JUNK_TITLE_RE, seedDeliverReady, shotDir, test } from "./helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPS_CHROME_RE = /OpenAPI|Health|Outbox|decision_maker|GateInstances|status=ready|M2-preview/i;

function assertNoOpsChrome(text: string) {
  expect(text).not.toMatch(OPS_CHROME_RE);
  expect(text).not.toContain("dm-1");
}

test.describe("E2E decision-maker shell", () => {
  test("decision_maker_shell_has_no_openapi_link", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("open-inbox")).toHaveText(/查看待我拍板/);
    await expect(page.getByTestId("office-empty")).toBeVisible();
    await expect(page.getByTestId("office-empty")).toContainText("此刻没有待办。安静是正常的。");
    await expect(page.getByRole("link", { name: /openapi|health|ops|outbox/i })).toHaveCount(0);
    const officeHrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") || ""),
    );
    expect(officeHrefs.some((h) => /\/ops|\/health|openapi/i.test(h))).toBe(false);
    assertNoOpsChrome(await page.locator("body").innerText());
    await page.screenshot({ path: join(shotDir, "office_empty_quiet.png"), fullPage: true });

    await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByRole("link", { name: /openapi|health|ops|outbox/i })).toHaveCount(0);
    const hrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") || ""),
    );
    expect(hrefs.some((h) => /\/ops|\/health|openapi/i.test(h))).toBe(false);
    assertNoOpsChrome(await page.locator("body").innerText());
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    await expect(page.getByTestId("gate-title")).toHaveText(HUMAN_GOAL.deliver);
    await expect(page.getByTestId("gate-title")).not.toHaveText(JUNK_TITLE_RE);
    await page.screenshot({ path: join(shotDir, "dm_inbox_only.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "inbox_one_card_human.png"), fullPage: true });
  });

  test("inbox_card_title_not_uuid", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const ready = await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    const title = (await page.getByTestId("gate-title").innerText()).trim();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toMatch(UUID_RE);
    expect(title).not.toMatch(JUNK_TITLE_RE);
    expect(title).not.toBe(ready.gate!.id);
    expect(title).toBe(HUMAN_GOAL.deliver);
    expect(title).toBe((ready.goal as { title?: string }).title);
    await expect(page.getByTestId("gate-id")).toHaveText(ready.gate!.id);
    await expect(page.getByTestId("gate-status")).toHaveText("待你决定");
  });

  test("ops_routes_forbidden_for_dm", async ({ request }) => {
    const res = await request.get("/ops", {
      headers: { "x-harness-role": "decision_maker", "x-harness-actor": "you" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ops_forbidden");
    const engineer = await request.get("/ops");
    expect(engineer.status()).toBe(200);
    expect(await engineer.text()).toContain("Outbox");
  });

  test("inbox_after_pass_is_quiet", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    await confirmPass(page);
    await expect(page.getByTestId("inbox-flash")).toHaveText("已通过。");
    await expect(page.getByTestId("inbox-empty")).toContainText("此刻没有待办。安静是正常的。");
    assertNoOpsChrome(await page.locator("body").innerText());
    await page.screenshot({ path: join(shotDir, "inbox_after_pass_quiet.png"), fullPage: true });
  });
});
