import { join } from "node:path";
import {
  drainReadyGates,
  expect,
  seedBusyDesk,
  seedDeliverPending,
  seedDeliverReady,
  shotDir,
  test,
} from "./helpers";

const DISPATCH_RE = /指派给|拖到工位|开始跑|派活|dispatch|assign/i;

test.describe("E2E office home P0", () => {
  test("office_home_p0_30s", async ({ page, baseURL }) => {
    await drainReadyGates(baseURL!);
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
    await expect(page.getByTestId("desk-heartbeat").first()).toHaveText(/尚无心跳|心跳新鲜|心跳过期/);

    const title = `办公室周报-${Date.now()}`;
    await page.getByTestId("goal-title-input").fill(title);
    await page.getByTestId("goal-intent-input").fill("写一份能读的周报");
    await page.getByTestId("new-goal").click();
    const card = page.getByTestId("goal-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("fill-slot")).toBeVisible();
    await expect(card.getByTestId("slot-progress")).toContainText(/等同事填|在填|等证据|已交产物/);
    await expect(card.getByRole("button", { name: /指派|开跑|dispatch/i })).toHaveCount(0);
    await expect(card.getByTestId("human-fill")).toHaveText("我来填");
    await card.getByTestId("human-fill").click();
    await expect(page.getByTestId("human-fill-dialog")).toBeVisible();
    await expect(page.getByTestId("human-fill-goal-title")).toHaveText(title);
    await page.getByTestId("human-fill-note").fill("我先写大纲");
    await page.getByTestId("human-fill-artifact").fill("file://outline.md");
    await page.getByTestId("human-fill-submit").click();
    await expect(card.getByTestId("slot-filler")).toContainText(/人填 · 你/);
    await expect(card.getByTestId("slot-filler")).toContainText("我先写大纲");
    await expect(card.getByTestId("slot-progress")).toHaveText("已交产物");
    await expect(card.getByTestId("slot-artifact")).toHaveAttribute("href", "file://outline.md");
    await expect(card.getByTestId("human-fill")).toHaveCount(0);
    await expect(card.getByRole("button", { name: /指派给|拖到工位|开始跑/ })).toHaveCount(0);

    const roster = page.getByTestId("roster");
    await expect(roster).toBeVisible();
    await expect(roster).toHaveAttribute("data-readonly", "true");
    await expect(page.getByTestId("desk-row").first()).toBeVisible();
    await expect(page.getByTestId("desk-status").first()).toHaveText(/在忙|等证据|空闲/);
    await expect(roster.getByRole("button")).toHaveCount(0);
    await expect(roster.locator("[draggable='true']")).toHaveCount(0);
    await expect(roster.getByTestId("desk-heartbeat").first()).toBeVisible();

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

  test("desk_ttl_never_shows_stale_busy", async ({ page }) => {
    const stale = new Date(Date.now() - 120_000).toISOString();
    const payload = {
      readonly: true,
      ttl_seconds: 90,
      desks: [
        {
          id: "pool_cursor",
          name: "Cursor 同事",
          avatar: "C",
          presence: "busy",
          status: "在忙",
          last_seen_at: stale,
          last_heartbeat: stale,
          heartbeat_fresh: false,
          ttl_seconds: 90,
        },
        {
          id: "pool_noop",
          name: "交付同事",
          avatar: "交",
          presence: "waiting_evidence",
          status: "等证据",
          last_seen_at: stale,
          heartbeat_fresh: false,
          ttl_seconds: 90,
        },
      ],
    };
    await page.route("**/v1/office/desks/presence", async (route) => {
      await route.fulfill({ json: payload });
    });
    await page.route("**/v1/desks", async (route) => {
      await route.fulfill({ json: payload });
    });
    await page.goto("/");
    const cursor = page.getByTestId("desk-row").filter({ hasText: "Cursor 同事" });
    await expect(cursor.getByTestId("desk-status")).not.toHaveText("在忙");
    await expect(cursor.getByTestId("desk-status")).toHaveText(/等证据|空闲/);
    await expect(cursor).toHaveAttribute("data-presence", /waiting_evidence|idle/);
    await expect(cursor.getByTestId("desk-heartbeat")).toContainText("心跳过期");
    const noop = page.getByTestId("desk-row").filter({ hasText: "交付同事" });
    await expect(noop.getByTestId("desk-status")).toHaveText("等证据");
  });
});
