import { join } from "node:path";
import {
  drainReadyGates,
  expect,
  HUMAN_GOAL,
  JUNK_TITLE_RE,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  evidenceDir,
  shotDir,
  test,
} from "./helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISPATCH_UI_RE = /指派给|拖到工位|开始跑|派活|assign|drag-dispatch|dispatch/i;
const OPS_CHROME_RE = /OpenAPI|Health|Outbox|decision_maker|GateInstances|status=ready|M2-preview/i;

test.describe("P0 AI office home", () => {
  test("home_is_office_not_inbox_wall", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.route("**/v1/goals", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ goals: [], readonly: true }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/");
    await expect(page.locator("header.top h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("goals-panel")).toBeVisible();
    await expect(page.getByTestId("create-goal")).toBeVisible();
    await expect(page.getByTestId("office-empty")).toBeVisible();
    await expect(page.getByTestId("office-empty")).toContainText("还没有目标。建一个，同事才会开工。");
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "false");
    await expect(page.getByTestId("gate-card")).toHaveCount(0);
    await expect(page.getByTestId("inbox-heading")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(OPS_CHROME_RE);
    expect(body).not.toContain("查看待我拍板");
    await page.screenshot({ path: join(shotDir, "office_empty_no_goals.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "office_empty_no_goals.png"), fullPage: true });
  });

  test("create_goal_shows_fill_slots", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await page.goto("/");
    await page.getByTestId("goal-name").fill("周报交付验收");
    await page.getByTestId("goal-ask").fill("要一份能转发的周报");
    const form = page.getByTestId("create-goal-form");
    await expect(form.locator("[name=steps],[name=script],[name=playbook]")).toHaveCount(0);
    await expect(form.getByText(/指派给|拖到工位|开始跑/)).toHaveCount(0);
    await page.getByTestId("create-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: "周报交付验收" }).first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("goal-title")).toHaveText("周报交付验收");
    await expect(card.getByTestId("goal-title")).not.toHaveText(UUID_RE);
    await expect(card.getByTestId("fill-slots")).toBeVisible();
    await expect(card.getByTestId("fill-slot")).toBeVisible();
    await expect(card.getByTestId("slot-filler")).toContainText(/还没人填|交付同事|Cursor 同事/);
    await expect(card.getByTestId("slot-progress")).toBeVisible();
    const slotText = await card.getByTestId("fill-slots").innerText();
    expect(slotText).not.toMatch(DISPATCH_UI_RE);
    await page.screenshot({ path: join(shotDir, "office_home_with_goals.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "office_home_with_goals.png"), fullPage: true });
  });

  test("roster_readonly_no_dispatch", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);
    await page.goto("/");
    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-entry")).toContainText("工位心跳");
    await expect(page.getByTestId("desks-hint")).toContainText("只读投影");
    const rows = page.getByTestId("desk-row");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("desk-status")).toHaveText([/在忙|等证据|空闲/, /在忙|等证据|空闲/]);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    const rosterText = await roster.innerText();
    expect(rosterText).not.toMatch(DISPATCH_UI_RE);
    expect(rosterText).not.toMatch(/打开画布才能开工/);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(OPS_CHROME_RE);
  });

  test("inbox_opens_as_drawer", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/");
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "false");
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await page.getByTestId("open-inbox").click();
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("gate-inbox")).toBeVisible();
    await expect(page.getByTestId("inbox-heading")).toBeVisible();
    await expect(page.getByTestId("office-shell")).toBeVisible();
    await expect(page.getByTestId("gate-card")).toHaveCount(1);
    await page.screenshot({ path: join(shotDir, "inbox_drawer_open.png"), fullPage: true });
    await page.screenshot({ path: join(evidenceDir, "inbox_drawer_open.png"), fullPage: true });
  });

  test("drawer_keeps_g1_copy", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await seedDeliverReady(baseURL!);
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-drawer")).toHaveAttribute("data-open", "true");
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("filter-ready")).toHaveText("要你决定");
    await expect(page.getByTestId("decide-pass")).toHaveText("通过");
    await expect(page.getByTestId("decide-revise")).toHaveText("打回重做");
    await expect(page.getByTestId("decide-defer")).toHaveText("稍后处理");
    await expect(page.getByTestId("gate-title")).toHaveText(HUMAN_GOAL.deliver);
    await expect(page.getByTestId("gate-title")).not.toHaveText(JUNK_TITLE_RE);
    await expect(page.getByTestId("gate-title")).not.toHaveText(UUID_RE);
    await expect(page.getByText("规则：交付验收")).toBeVisible();
    await expect(page.getByText("证据已齐，等你拍板")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(OPS_CHROME_RE);
    expect(body).not.toContain("dm-1");
    expect(body).not.toContain("标记完成");
    expect(body).not.toContain("去画布看进度");
  });
});
