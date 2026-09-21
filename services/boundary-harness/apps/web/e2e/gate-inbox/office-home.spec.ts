import { join } from "node:path";
import {
  STATUS_LINE_DONE,
  STATUS_LINE_FILLING,
  STATUS_LINE_PENDING_DECISION,
} from "../../../../packages/domain/src/index";
import {
  api,
  clearHeartbeats,
  drainReadyGates,
  expect,
  headers,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  seedHeartbeat,
  shotDir,
  test,
} from "./helpers";

const DISPATCH_RE = /指派给|拖到工位|开始跑|派活|dispatch|assign/i;

test.describe("E2E office home P0", () => {
  test("office_home_p0_30s", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await clearHeartbeats(baseURL!);
    await seedDeliverPending(baseURL!);
    await seedBusyDesk(baseURL!);

    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("AI 办公室");
    await expect(page.getByTestId("new-goal")).toBeVisible();
    await expect(page.getByTestId("desks-entry")).toHaveText("工位心跳");
    await expect(page.getByTestId("office-shell").getByTestId("gate-card")).toHaveCount(0);
    await expect(page.getByTestId("inbox-drawer")).not.toHaveClass(/open/);
    const homeText = await page.getByTestId("office-shell").innerText();
    expect(homeText).not.toMatch(DISPATCH_RE);
    expect(homeText).not.toContain("OpenAPI");
    await expect(page.getByTestId("office-empty")).toContainText("还没有目标。建一个，同事才会开工。");

    const title = `办公室周报-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    const openSlot = card.locator('[data-testid="fill-slot"][data-stage-locked="false"]');
    await expect(openSlot).toBeVisible();
    await expect(card.locator('[data-testid="fill-slot"][data-stage-locked="true"]')).toBeVisible();
    await expect(openSlot.getByTestId("slot-progress")).toContainText(/等同事填|在填|等证据|已交产物/);
    await expect(openSlot.getByTestId("human-fill")).toHaveText("我来填");
    await openSlot.getByTestId("human-fill").click();
    await expect(card.getByTestId("slot-filler")).toContainText("人填");
    await expect(card.getByRole("button", { name: /指派|开跑|dispatch/i })).toHaveCount(0);

    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desks-empty")).toHaveText("还没有 Bot 报心跳");
    await expect(page.getByTestId("desk-row")).toHaveCount(0);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    expect(await roster.innerText()).not.toMatch(/交付同事|Cursor 同事/);

    await page.screenshot({ path: join(shotDir, "office_home_goals.png"), fullPage: true });

    await seedDeliverReady(baseURL!);
    await page.getByTestId("open-inbox").click();
    await expect(page.getByTestId("inbox-drawer")).toHaveClass(/open/);
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("gate-card").first()).toBeVisible();
    await expect(page.getByTestId("decide-pass").first()).toHaveText("通过");
    await expect(page.getByTestId("decide-revise").first()).toHaveText("打回重做");
    await expect(page.getByTestId("gate-title").first()).not.toHaveText(/e2e|g-[0-9]/i);
    await page.screenshot({ path: join(shotDir, "office_home_drawer.png"), fullPage: true });

    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-heading")).toHaveText(/待办/);
    await expect(page.getByTestId("gate-card").first()).toBeVisible();
  });

  test("status_line_all_slots_done_not_filling", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    const title = `周报交付验收-${Date.now()}`;
    const ready = await seedDeliverReady(baseURL!, title);
    const listed = await api<{ goals: Array<{ id: string; status_line?: string }> }>(baseURL!, "/v1/goals", {
      headers: headers.decisionMaker,
    });
    const goal = (listed.body.goals ?? []).find((g) => g.id === ready.goal.id);
    const apiLine = goal?.status_line ?? "";
    expect(STATUS_LINE_PENDING_DECISION).toBe("等你拍板");
    expect(STATUS_LINE_DONE).toBe("已交齐");
    expect(apiLine).toBe(STATUS_LINE_PENDING_DECISION);
    expect(apiLine).not.toBe("待拍板");
    expect(apiLine).not.toBe("已交产物");
    expect(apiLine).not.toBe(STATUS_LINE_FILLING);
    expect(apiLine).not.toMatch(/同事在填|filling/i);

    await page.goto("/");
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    const status = card.getByTestId("goal-status");
    await expect(status).toHaveText(apiLine);
    await expect(status).toHaveText(STATUS_LINE_PENDING_DECISION);
    await expect(status).not.toHaveText(STATUS_LINE_FILLING);
    await expect(status).not.toHaveText("待拍板");
    expect(await status.innerText()).toBe(apiLine);
    await page.screenshot({ path: join(shotDir, "status_line_all_slots_done_not_filling.png"), fullPage: true });
  });

  test("desks_busy_only_from_domain_presence", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
    await clearHeartbeats(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-idle", display_name: "闲逛 Bot", group: "harness" });
    const idleListed = await api<{
      desks: Array<{ id: string; presence?: string; status?: string; last_heartbeat?: string }>;
    }>(baseURL!, "/v1/desks", { headers: headers.decisionMaker });
    const idleApi = idleListed.body.desks.find((d) => d.id === "agent:bot-idle");
    expect(idleApi?.presence).toBe("idle");
    expect(idleApi?.last_heartbeat).toBeTruthy();

    await page.goto("/");
    const idleRow = page.getByTestId("desk-row").filter({ has: page.getByTestId("desk-name").filter({ hasText: "闲逛 Bot" }) });
    await expect(idleRow).toHaveAttribute("data-presence", idleApi!.presence!);
    await expect(idleRow.getByTestId("desk-status")).toHaveText(idleApi!.status || "空闲");
    await expect(idleRow.getByTestId("desk-status")).not.toHaveText("在忙");

    await seedBusyDesk(baseURL!);
    await seedHeartbeat(baseURL!, { actor: "bot-cursor", display_name: "调研 Bot", pool_id: "pool_cursor", group: "2048" });
    const busyListed = await api<{
      desks: Array<{ id: string; presence?: string; status?: string; last_heartbeat?: string }>;
    }>(baseURL!, "/v1/desks", { headers: headers.decisionMaker });
    const busyApi = busyListed.body.desks.find((d) => d.id === "agent:bot-cursor");
    expect(busyApi?.presence).toBe("busy");

    await page.reload();
    const busyRow = page.getByTestId("desk-row").filter({ has: page.getByTestId("desk-name").filter({ hasText: "调研 Bot" }) });
    await expect(busyRow).toHaveAttribute("data-presence", "busy");
    await expect(busyRow.getByTestId("desk-status")).toHaveText(busyApi!.status || "在忙");
    await expect(idleRow).toHaveAttribute("data-presence", "idle");
    const roster = page.getByTestId("roster");
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    expect(await roster.innerText()).not.toMatch(DISPATCH_RE);
  });
});
