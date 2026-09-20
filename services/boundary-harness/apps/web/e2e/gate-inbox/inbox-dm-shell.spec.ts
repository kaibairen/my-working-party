import { join } from "node:path";
import {
  clearHeartbeats,
  confirmPass,
  drainReadyGates,
  evidenceDir,
  expect,
  HUMAN_GOAL,
  JUNK_TITLE_RE,
  seedBusyDesk,
  seedHeartbeat,
  seedDeliverPending,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

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
    await expect(page.getByTestId("open-inbox")).toHaveText(/待办/);
    await expect(page.getByTestId("new-goal")).toBeVisible();
    await expect(page.getByTestId("office-empty")).toContainText("还没有目标。建一个，同事才会开工。");
    await expect(page.getByTestId("office-shell").getByTestId("gate-card")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /openapi|health|ops|outbox/i })).toHaveCount(0);
    const officeHrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") || ""),
    );
    expect(officeHrefs.some((h) => /\/ops|\/health|openapi/i.test(h))).toBe(false);
    assertNoOpsChrome(await page.locator("body").innerText());
    await page.screenshot({ path: join(shotDir, "office_empty_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(shotDir, "human_office_empty.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "office_empty_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "human_office_empty.png"), fullPage: true });

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
    await page.screenshot({ path: join(shotDir, "human_inbox_one_card.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "inbox_one_card_human.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "human_inbox_one_card.png"), fullPage: true });
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

  test("roster_is_read_only_presence", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await clearHeartbeats(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByRole("link", { name: /openapi|health|ops|outbox/i })).toHaveCount(0);
    await expect(page.getByTestId("desks-entry")).toHaveText("工位心跳");
    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-hint")).toContainText("只读投影");
    await expect(page.getByTestId("desks-hint")).toContainText("不是侧栏同步");
    await expect(page.getByTestId("desks-hint")).not.toContainText(/打开画布才能开工|去 Roster|派活|指派/);
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有 Bot 报心跳");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    const emptyText = await roster.innerText();
    expect(emptyText).not.toMatch(/交付同事|Cursor 同事/);

    await seedHeartbeat(baseURL!, { actor: "bot-deliver", display_name: "周报 Bot", pool_id: "pool_noop", group: "harness" });
    await seedHeartbeat(baseURL!, { actor: "bot-cursor", display_name: "调研 Bot", pool_id: "pool_cursor", group: "2048" });
    await page.reload();
    const rows = page.getByTestId("desk-row");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("desk-group")).toHaveCount(2);
    await expect(page.getByTestId("desk-group-title")).toHaveText(["harness开发", "2048工作组"]);
    await expect(page.getByTestId("desk-name")).toHaveText(["周报 Bot", "调研 Bot"]);
    await expect(page.getByTestId("desk-status")).toHaveText([/在忙|等证据|空闲/, /在忙|等证据|空闲/]);
    await expect(rows.filter({ has: page.getByTestId("desk-status").filter({ hasText: "在忙" }) })).toHaveCount(1);
    await expect(rows.filter({ has: page.getByTestId("desk-status").filter({ hasText: "等证据" }) })).toHaveCount(1);
    const namedText = await roster.innerText();
    expect(namedText).not.toMatch(/交付同事|Cursor 同事/);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.getByRole("link")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    await expect(roster.getByRole("textbox")).toHaveCount(0);
    const rosterText = await roster.innerText();
    expect(rosterText).not.toMatch(/派活|指派|dispatch|assign|drag|OpenAPI|Health/i);
    expect(rosterText).not.toMatch(JUNK_TITLE_RE);
    assertNoOpsChrome(await page.locator("body").innerText());
    await page.screenshot({ path: join(shotDir, "office_with_roster_min.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "office_with_roster_min.png"), fullPage: true });
  });

  test("inbox_card_title_rejects_seed_ids", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!, "e2e pending g-1789786901848-a5tcbi");
    await page.goto("/inbox");
    const title = page.getByTestId("gate-title");
    await expect(title).toHaveText("未命名目标");
    await expect(title).not.toHaveText(JUNK_TITLE_RE);
    await expect(title).not.toHaveText(UUID_RE);
    assertNoOpsChrome(await page.locator("body").innerText());
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
    await page.screenshot({ path: join(shotDir, "human_inbox_after_pass.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "inbox_after_pass_quiet.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "human_inbox_after_pass.png"), fullPage: true });
  });
});
